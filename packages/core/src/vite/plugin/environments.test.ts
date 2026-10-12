import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder, type InlineConfig, type Rollup, type ViteBuilder } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import { assetUrl, clientUrl, environmentBuild, environmentOrder, seedBase } from "./environments.ts";
import { flare } from "./flare.ts";
import type { FlareOptions } from "./options.ts";

const SHEET = fileURLToPath(new URL("../../shared/css/sheet.ts", import.meta.url));

// A client entry with a stylesheet, a CSS asset, and a lazy chunk, and a server entry that keeps the sheet module.
const APP = {
	"client.tsx": 'import "./app.css";\nvoid import("./lazy.ts");\n',
	"lazy.ts": "export const lazy = 1;\n",
	"app.css": ".a{background:url(./dot.svg)}\n",
	"dot.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
	"server.ts": `export { builtHref, builtSheet } from ${JSON.stringify(SHEET)};\n`,
};

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string> = APP): string {
	const root = mkdtempSync(join(tmpdir(), "flare-env-"));
	roots.push(root);
	mkdirSync(join(root, "src"));
	for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "src", name), text);
	return root;
}

// A builder over flare() alone, writing nothing. Assets are never inlined, so a CSS `url()` is a built file.
function builder(root: string, options: FlareOptions = {}, config: InlineConfig = {}): Promise<ViteBuilder> {
	return createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: flare(options),
		...config,
		build: { write: false, assetsInlineLimit: 0, ...config.build },
	});
}

function outputs(result: unknown): Rollup.OutputBundle[keyof Rollup.OutputBundle][] {
	const list = Array.isArray(result) ? result : [result];
	return list.flatMap((item: unknown) =>
		typeof item === "object" && item !== null && "output" in item && Array.isArray(item.output) ? item.output : [],
	);
}

function text(files: ReturnType<typeof outputs>, name: string): string {
	const found = files.find((file) => file.fileName === name || file.fileName.endsWith(name));
	if (found === undefined) throw new Error(`no ${name}`);
	return found.type === "chunk" ? found.code : String(found.source);
}

it("defaults", async () => {
	const app = await builder(project());
	expect(app.environments.client?.config.build).toMatchObject({
		outDir: "dist/client",
		manifest: true,
		cssCodeSplit: false,
		assetsDir: "assets",
	});
	const ssr = app.environments.ssr?.config.build;
	expect(ssr).toMatchObject({ outDir: "dist/server", minify: "oxc", sourcemap: true });
	expect(ssr?.rollupOptions.output).toMatchObject({ entryFileNames: "server.js" });
	// A caller's outDir replaces `dist`.
	const out = await builder(project(), {}, { build: { outDir: "out" } });
	expect(out.environments.client?.config.build.outDir).toBe("out/client");
	expect(out.environments.ssr?.config.build.outDir).toBe("out/server");
	const pure = environmentBuild();
	expect(pure.client).toEqual({ outDir: "dist/client", manifest: true, cssCodeSplit: false, assetsDir: "assets" });
	expect(`${pure.ssr.outDir}/${pure.ssr.input}`).toBe("dist/server/server.js");
});

it("assets dir", async () => {
	expect(environmentBuild({ assetsBase: "/" }).client.assetsDir).toBe("assets");
	expect(environmentBuild({ assetsBase: "/cdn" }).client.assetsDir).toBe("cdn");
	expect(() => environmentBuild({ assetsBase: "/", assetsDir: "static" })).toThrow("assets");
	await expect(builder(project(), { assetsBase: "/" }, { build: { assetsDir: "static" } })).rejects.toThrow("assets");
});

it("order", async () => {
	expect(environmentOrder(true)).toEqual(["client", "ssr", "worker"]);
	const app = await builder(project());
	const built: string[] = [];
	vi.spyOn(app, "build").mockImplementation(async (environment) => {
		built.push(environment.name);
		environment.isBuilt = true;
		return { output: [] } as never;
	});
	await app.buildApp();
	expect(built).toEqual(["client", "ssr"]);
});

it("no worker", () => {
	expect(environmentOrder(false)).toEqual(["client", "ssr"]);
});

it("client url", () => {
	expect(clientUrl({ entry: "src/client.tsx" })).toBe("/src/client.tsx");
	const manifest = { "src/client.tsx": { file: "assets/client-1a2b3c.js" } };
	expect(clientUrl({ entry: "src/client.tsx", manifest })).toBe("/assets/client-1a2b3c.js");
	expect(clientUrl({ entry: "src/client.tsx", manifest, urls: { base: "/app/", assetsBase: "/assets" } })).toBe(
		"/app/assets/client-1a2b3c.js",
	);
	expect(() => clientUrl({ entry: "src/main.tsx", manifest })).toThrow(/src\/main\.tsx/);
});

// One resolver gives every URL the server writes. A chunk URL is relative to the entry chunk, so it lands under the
// same prefix. The seed directory is a path inside the client output, which a file read or the Workers assets
// binding serves, and its public URL agrees too.
it("urls agree", async () => {
	const cases: Array<{ options: FlareOptions; config: InlineConfig; prefix: string }> = [
		{ options: {}, config: { base: "/app/" }, prefix: "/app/assets/" },
		{ options: { assetsBase: "/cdn" }, config: {}, prefix: "/cdn/" },
		{ options: { assetsBase: "/" }, config: {}, prefix: "/" },
	];
	for (const { options, config, prefix } of cases) {
		const app = await builder(project(), options, config);
		const urls = { base: app.config.base, assetsBase: options.assetsBase ?? "/assets" };
		const client = outputs(await app.build(app.environments.client ?? never()));
		const manifest: Record<string, { file: string }> = JSON.parse(text(client, ".vite/manifest.json"));
		const entry = clientUrl({ entry: "src/client.tsx", manifest, urls });
		expect(entry.startsWith(prefix)).toBe(true);
		expect(entry.slice(prefix.length)).not.toContain("/");
		const lazy = manifest["src/lazy.ts"]?.file ?? never();
		expect(text(client, basename(entry))).toContain(`./${basename(lazy)}`);
		expect(new URL(`./${basename(lazy)}`, `http://host${entry}`).pathname).toBe(assetUrl(lazy, urls));
		const server = text(outputs(await app.build(app.environments.ssr ?? never())), "server.js");
		expect(server).toMatch(new RegExp(`["'\`]${prefix}style-[\\w-]+\\.css["'\`]`));
		expect(server).toMatch(new RegExp(`url\\(${prefix}dot-[\\w-]+\\.svg\\)`));
		expect(assetUrl(seedBase(urls.assetsBase).slice(1), urls).startsWith(prefix)).toBe(true);
	}
	expect(seedBase("/assets")).toBe("/assets/_flare-static");
	expect(seedBase("/cdn")).toBe("/cdn/_flare-static");
	expect(seedBase("/")).toBe("/assets/_flare-static");
}, 60_000);

// The server reads the client build's stylesheet, so a server build that runs first fails.
it("css order", async () => {
	const app = await builder(project());
	await expect(app.build(app.environments.ssr ?? never())).rejects.toThrow(/client build must run before/);
}, 30_000);

function never(): never {
	throw new Error("missing");
}
