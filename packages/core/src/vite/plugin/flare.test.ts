import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import solid from "@solidjs/vite-plugin";
import { expect, it, vi } from "vitest";
import { fnId } from "../route-meta/index.ts";
import { flare } from "./flare.ts";

vi.mock("@solidjs/vite-plugin", () => ({
	default: vi.fn<() => Array<{ name: string }>>(() => [{ name: "solid" }]),
}));

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "flare-plugin-"));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/client.tsx"), "");
	writeFileSync(join(root, "src/server.ts"), "");
	return root;
}

function apply(
	config: { root?: string; server?: { host?: string | boolean } },
	options?: Parameters<typeof flare>[0],
): void {
	const plugin = flare(options).find((item) => item.name === "flare");
	const hook = plugin?.config;
	if (typeof hook !== "function") throw new Error("config");
	hook.call(null as never, config as never, { command: "serve", mode: "development" } as never);
}

it("entry", () => {
	const root = project();
	try {
		expect(() => apply({ root })).not.toThrow();
		expect(() => apply({})).toThrow("entry.client src/client.tsx");
		rmSync(join(root, "src/client.tsx"));
		expect(() => apply({ root })).toThrow("entry.client src/client.tsx");
		writeFileSync(join(root, "src/client.tsx"), "");
		rmSync(join(root, "src/server.ts"));
		expect(() => apply({ root })).toThrow("entry.server src/server.ts");
		writeFileSync(join(root, "src/server.ts"), "");
		expect(() => apply({ root }, { entry: { client: "/tmp/client.tsx" } })).toThrow(/^entry\.client$/);
		expect(() => apply({ root }, { entry: { server: "/tmp/server.ts" } })).toThrow(/^entry\.server$/);
		expect(() => apply({ root }, { entry: { client: "src/missing.tsx" } })).toThrow("entry.client src/missing.tsx");
		expect(() => apply({ root }, { entry: { server: "src/missing.ts" } })).toThrow("entry.server src/missing.ts");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("host", () => {
	const root = project();
	try {
		expect(() => apply({ root, server: { host: true } })).toThrow(/^true$/);
		expect(() => apply({ root, server: { host: "0.0.0.0" } })).toThrow("0.0.0.0");
		expect(() => apply({ root, server: { host: "::" } })).toThrow(/^::$/);
		expect(() => apply({ root })).not.toThrow();
		expect(() => apply({ root, server: { host: "localhost" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "127.0.0.1" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "::1" } })).not.toThrow();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("solid options", () => {
	flare();
	expect(vi.mocked(solid)).toHaveBeenCalledWith({ ssr: true, extensions: [".tsx", ".jsx"] });
});

type EnvHook = (name: string, config: object, env: { command: "serve" | "build"; mode: string }) => unknown;

function flarePlugin(options?: Parameters<typeof flare>[0]) {
	const plugin = flare(options).find((item) => item.name === "flare");
	if (plugin === undefined) throw new Error("plugin");
	return plugin;
}

function defineFor(plugin: ReturnType<typeof flarePlugin>, name: string, command: "serve" | "build"): unknown {
	const hook = plugin.configEnvironment;
	if (typeof hook !== "function") throw new Error("configEnvironment");
	return (hook as EnvHook).call(null, name, {}, { command, mode: "development" });
}

it("client entry define", () => {
	const plugin = flarePlugin();
	const define = { define: { "import.meta.env.FLARE_CLIENT_ENTRY": JSON.stringify("/src/client.tsx") } };
	expect(defineFor(plugin, "ssr", "serve")).toEqual(define);
	expect(defineFor(plugin, "worker", "serve")).toEqual(define);
	expect(defineFor(plugin, "client", "serve")).toBeUndefined();
	expect(defineFor(plugin, "ssr", "build")).toBeUndefined();
	expect(defineFor(flarePlugin({ entry: { client: "src/entry.tsx" } }), "ssr", "serve")).toEqual({
		define: { "import.meta.env.FLARE_CLIENT_ENTRY": JSON.stringify("/src/entry.tsx") },
	});
	const root = project();
	try {
		const config = plugin.config;
		if (typeof config !== "function") throw new Error("config");
		expect(config.call(null as never, { root } as never, { command: "serve", mode: "development" } as never)).toEqual({
			appType: "custom",
			resolve: { dedupe: ["solid-js", "@solidjs/web"] },
			ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
			optimizeDeps: { exclude: ["@lovrozagar/flare"] },
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("dev server", () => {
	const hook = flarePlugin().configureServer;
	if (typeof hook !== "function") throw new Error("configureServer");
	const used: unknown[] = [];
	const server = (middlewareMode: boolean) => ({
		config: { server: { middlewareMode } },
		middlewares: { use: (handler: unknown) => void used.push(handler) },
		transformIndexHtml: async (_url: string, html: string) => html,
		ws: { send: () => undefined },
		environments: { ssr: { hot: { on: () => undefined } } },
	});
	expect(hook.call(null as never, server(true) as never)).toBeUndefined();
	const post = hook.call(null as never, server(false) as never);
	expect(typeof post).toBe("function");
});

// The map carries the original source, so only the code is checked.
function code(result: unknown): string {
	return String(Reflect.get(Object(result), "code"));
}

it("boundary transform", () => {
	const plugin = flare().find((item) => item.name === "flare:boundary");
	expect(plugin?.enforce).toBe("pre");
	const hook = plugin?.transform;
	if (typeof hook !== "function") throw new Error("transform");
	const root = "/app";
	const run = (name: string, id: string, code: string): unknown =>
		Reflect.apply(hook, { environment: { name, config: { root } } }, [code, id]);
	const source =
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const read = createServerOnlyFn(() => SECRET);\n';
	expect(code(run("client", "/app/src/lib/read.ts", source))).not.toContain("SECRET");
	expect(run("ssr", "/app/src/lib/read.ts", source)).toBeNull();
	expect(code(run("worker", "/app/src/lib/read.ts", source))).not.toContain("SECRET");
	// The id hashes the root-relative path.
	const fn =
		'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(h);\n';
	expect(code(run("ssr", "/app/src/fns/echo.ts", fn))).toContain(`__id: "${fnId("src/fns/echo.ts", "echo")}"`);
	for (const id of [
		"/app/src/lib/read.ts?raw",
		"\0virtual:x.ts",
		"/app/src/style.css",
		"/elsewhere/read.ts",
		"/app/node_modules/x/read.ts",
	]) {
		expect(run("client", id, source)).toBeNull();
	}
	expect(run("client", "/app/src/plain.ts", "export const a = 1;\n")).toBeNull();
});
