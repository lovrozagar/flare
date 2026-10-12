import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder, type Plugin } from "vite";
import { afterEach, expect, it } from "vitest";
import { flare } from "../plugin/flare.ts";
import { checkChunk } from "./tripwire.ts";

const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MINIMAL = resolve(fileURLToPath(new URL("../../../tests/e2e/apps/minimal", import.meta.url)));

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Graph = "client" | "ssr" | "worker";

// A fixture app: `files` under a fresh root, the client and worker entry at src/client.ts, the ssr entry at
// src/server.ts. Every bare import stays external, so a chunk holds only the fixture's own modules.
function fixture(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "flare-tripwire-"));
	roots.push(root);
	for (const [path, source] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), source);
	}
	return root;
}

// A bare import stays out of the chunk.
function external(id: string): boolean {
	return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0");
}

function boundary(): Plugin {
	const plugin = flare().find((item) => item.name === "flare:boundary");
	if (plugin === undefined) throw new Error("flare:boundary");
	return plugin;
}

// The emitted code of one graph's build, or the build's rejection.
async function build(root: string, graph: Graph, extra: Plugin[] = []): Promise<string> {
	const input = join(root, graph === "ssr" ? "src/server.ts" : "src/client.ts");
	const environment = { build: { write: false, minify: false, rollupOptions: { input, external } } };
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [boundary(), ...extra],
		environments: {
			client: environment,
			ssr: { ...environment, build: { ...environment.build, ssr: true } },
			worker: { ...environment, consumer: "client" },
		},
	});
	const output = await builder.build(builder.environments[graph]);
	const results = Array.isArray(output) ? output : [output];
	return results
		.flatMap((result) => ("output" in result ? result.output : []))
		.map((item) => ("code" in item ? item.code : ""))
		.join("\n");
}

// A plugin after the boundary transform that writes a body back into a module, as a broken plugin would.
function forcing(file: string, from: string, to: string): Plugin {
	return {
		name: "force",
		enforce: "post",
		transform(code, id) {
			return id.endsWith(file) ? code.replace(from, to) : null;
		},
	};
}

const FN = 'import { createServerFn } from "@lovrozagar/flare/server-fn";\n';
const ENV = 'import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n';

// An entry that uses everything a module exports, so the build does not shake the module out.
function KEEP(path: string): string {
	return `import * as mod from "${path}";\nReflect.set(globalThis, "kept", mod);\n`;
}

function app(module: string): Record<string, string> {
	return {
		"src/mod.ts": module,
		"src/client.ts": KEEP("./mod.ts"),
		"src/server.ts": KEEP("./mod.ts"),
	};
}

it("handler body", async () => {
	const root = fixture(app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`));
	const client = await build(root, "client");
	expect(client).toContain("createServerFn");
	expect(client).not.toContain("SENTINEL_FN");
	await expect(
		build(root, "client", [forcing("mod.ts", ".handler(undefined)", '.handler(() => "SENTINEL_FN")')]),
	).rejects.toThrow(/src\/mod\.ts holds code the client graph must not contain \(B45\)/);
});

it("server path", async () => {
	const root = fixture({
		"src/client.ts": KEEP(`${PACKAGE_SRC}/server/lifecycle/create.ts`),
	});
	await expect(build(root, "client")).rejects.toThrow(
		/src\/server\/.+ is server code and cannot be in the client graph \(B45\)/,
	);
});

it("worker", async () => {
	const root = fixture(app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`));
	expect(await build(root, "worker")).not.toContain("SENTINEL_FN");
	await expect(
		build(root, "worker", [forcing("mod.ts", ".handler(undefined)", '.handler(() => "SENTINEL_FN")')]),
	).rejects.toThrow(/the worker graph must not contain/);
	const path = fixture({
		"src/client.ts": KEEP(`${PACKAGE_SRC}/server/lifecycle/create.ts`),
	});
	await expect(build(path, "worker")).rejects.toThrow(/cannot be in the worker graph/);
});

it("server only body", async () => {
	const root = fixture(app(`${ENV}export const read = createServerOnlyFn(() => "SENTINEL_ENV");\n`));
	expect(await build(root, "client")).not.toContain("SENTINEL_ENV");
	expect(await build(root, "worker")).not.toContain("SENTINEL_ENV");
	expect(await build(root, "ssr")).toContain("SENTINEL_ENV");
	const force = forcing("mod.ts", "createServerOnlyFn()", 'createServerOnlyFn(() => "SENTINEL_ENV")');
	await expect(build(root, "client", [force])).rejects.toThrow(/B45/);
	await expect(build(root, "worker", [force])).rejects.toThrow(/B45/);
});

it("client only body", async () => {
	const root = fixture(app(`${ENV}export const focus = createClientOnlyFn(() => "SENTINEL_CLIENT");\n`));
	expect(await build(root, "ssr")).not.toContain("SENTINEL_CLIENT");
	expect(await build(root, "client")).toContain("SENTINEL_CLIENT");
	const force = forcing("mod.ts", "createClientOnlyFn()", 'createClientOnlyFn(() => "SENTINEL_CLIENT")');
	await expect(build(root, "ssr", [force])).rejects.toThrow(/the ssr graph must not contain/);
});

it("iso server body", async () => {
	const root = fixture(
		app(`${ENV}export const pick = createIsomorphicFn().server(() => "SENTINEL_ISO").client(() => "CLIENT_SIDE");\n`),
	);
	expect(await build(root, "client")).not.toContain("SENTINEL_ISO");
	expect(await build(root, "worker")).not.toContain("SENTINEL_ISO");
	expect(await build(root, "ssr")).toContain("SENTINEL_ISO");
	const force = forcing("mod.ts", ".server()", '.server(() => "SENTINEL_ISO")');
	await expect(build(root, "client", [force])).rejects.toThrow(/B45/);
	const back = forcing("mod.ts", ".client()", '.client(() => "CLIENT_SIDE")');
	await expect(build(root, "ssr", [back])).rejects.toThrow(/B45/);
});

it("clean", async () => {
	const builder = await createBuilder({
		root: MINIMAL,
		configFile: false,
		logLevel: "silent",
		plugins: [flare()],
		environments: {
			client: { build: { write: false, rollupOptions: { input: join(MINIMAL, "src/client.tsx"), external } } },
			ssr: { build: { write: false, ssr: true, rollupOptions: { input: join(MINIMAL, "src/server.ts"), external } } },
		},
	});
	await expect(builder.build(builder.environments.client)).resolves.toBeDefined();
	await expect(builder.build(builder.environments.ssr)).resolves.toBeDefined();
});

it("four bodies", async () => {
	const module = `${FN}export const echo = createServerFn()
	.input(() => "SENTINEL_INPUT")
	.authorize(({ auth }) => auth === "SENTINEL_AUTH")
	.handler(() => "SENTINEL_FN");
export const numbers = createServerFn().stream(async function* () {
	yield "SENTINEL_STREAM";
});
`;
	const root = fixture(app(module));
	const sentinels = ["SENTINEL_INPUT", "SENTINEL_AUTH", "SENTINEL_FN", "SENTINEL_STREAM"];
	for (const graph of ["client", "worker"] as const) {
		const code = await build(root, graph);
		for (const sentinel of sentinels) expect(code).not.toContain(sentinel);
	}
	const ssr = await build(root, "ssr");
	for (const sentinel of sentinels) expect(ssr).toContain(sentinel);
	const bodies: Array<[string, string]> = [
		[".input(undefined)", '.input(() => "SENTINEL_INPUT")'],
		[".authorize(undefined)", '.authorize(({ auth }) => auth === "SENTINEL_AUTH")'],
		[".handler(undefined)", '.handler(() => "SENTINEL_FN")'],
		[".stream(undefined)", '.stream(async function* () { yield "SENTINEL_STREAM"; })'],
	];
	for (const [from, to] of bodies) {
		await expect(build(root, "client", [forcing("mod.ts", from, to)])).rejects.toThrow(/B45/);
	}
});

it("outside root", async () => {
	// A workspace module outside the app root is never transformed, so its body reaches the chunk and fails it.
	const workspace = fixture({
		"lib/fns.ts": `${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`,
	});
	const root = fixture({ "src/client.ts": KEEP(`${workspace}/lib/fns.ts`) });
	await expect(build(root, "client")).rejects.toThrow(/lib\/fns\.ts holds code the client graph must not contain/);
});

function route(chain: string): string {
	return `import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/a")${chain};\n`;
}

// One client chunk with one module, checked directly.
function check(code: string | null): void {
	checkChunk({
		graph: "client",
		chunk: "c.js",
		modules: [{ id: "/app/src/a.page.ts?v=1", code }],
		packageSrc: "/pkg/src",
	});
}

it("route method", () => {
	expect(() => check(route(".loader(load).render(r)"))).toThrow(
		"c.js: /app/src/a.page.ts holds code the client graph must not contain (B45)",
	);
	expect(() => check(route(".response(answer)"))).toThrow(/B45/);
	expect(() => check(route(".response(undefined)"))).not.toThrow();
	expect(() => check(route(".render(r)"))).not.toThrow();
	expect(() => check(null)).not.toThrow();
	expect(() => check("export const = ;")).toThrow(
		/c\.js: \/app\/src\/a\.page\.ts could not be read by the tripwire: .+ \(B45\)/,
	);
});
