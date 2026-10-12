import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, expect, it } from "vitest";
import { inject } from "./inject.ts";
import { RESET } from "./reset.ts";

const SHEET = fileURLToPath(new URL("../../shared/css/sheet.ts", import.meta.url));

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A small client build of `files` through the plugin alone, kept in memory.
async function built(files: Record<string, string>, reset: boolean): Promise<{ css: string[]; js: string }> {
	const root = mkdtempSync(join(tmpdir(), "flare-css-"));
	roots.push(root);
	mkdirSync(join(root, "src"));
	for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "src", name), text);
	const result = await build({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: inject({ reset, clientEntry: "src/client.ts" }),
		build: { write: false, rollupOptions: { input: join(root, "src/client.ts") } },
	});
	// A one-environment build without watch is one output.
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ("output" in item ? item.output : []));
	const css = outputs.flatMap((item) =>
		item.type === "asset" && item.fileName.endsWith(".css") ? [String(item.source)] : [],
	);
	const js = outputs.flatMap((item) => (item.type === "chunk" ? [item.code] : [])).join("\n");
	return { css, js };
}

// A plugin hook called with a stand-in for Vite's context.
function call(hook: unknown, context: object, args: unknown[]): unknown {
	const fn = typeof hook === "object" && hook !== null && "handler" in hook ? hook.handler : hook;
	if (typeof fn !== "function") throw new Error("hook");
	return Reflect.apply(fn, context, args);
}

function context(name: string, command: "build" | "serve" = "build"): object {
	return {
		environment: { name, config: { base: "/", command, root: "/app" } },
		error: (message: string) => {
			throw new Error(message);
		},
	};
}

const asset = (fileName: string, source: string) => ({ type: "asset", fileName, source });

it("reset off", async () => {
	const { css } = await built({ "client.ts": 'import "./app.css";', "app.css": ".a{color:red}" }, false);
	expect(css).toHaveLength(1);
	expect(css[0]?.startsWith("@layer reset")).toBe(false);
});

// The preflight is a CSS module the client entry imports first, so it is in the hashed file and in dev.
it("reset on", async () => {
	const { css } = await built({ "client.ts": 'import "./app.css";', "app.css": ".a{color:red}" }, true);
	expect(css[0]?.startsWith("@layer reset{")).toBe(true);
	expect(css[0]).toContain("box-sizing:border-box");
	expect(css[0]?.indexOf(".a{color:red}")).toBeGreaterThan(css[0]?.indexOf("@layer reset") ?? 0);
	expect(RESET.startsWith("@layer reset")).toBe(true);
});

// The server environments load the sheet module as the client build's one stylesheet and its href. A server build
// before the client build has nothing to load, and dev keeps the empty module.
it("server sheet", () => {
	const plugins = inject({ reset: false, clientEntry: "src/client.ts" });
	const [main, capture] = plugins;
	expect(() => call(main?.load, context("ssr"), [SHEET])).toThrow(/client build/);
	const bundle = { "style.css": asset("assets/style-1.css", "body{color:red}") };
	call(capture?.generateBundle, context("client"), [{}, bundle]);
	for (const name of ["ssr", "worker"]) {
		expect(call(main?.load, context(name), [SHEET])).toBe(
			'export const builtSheet = "body{color:red}";\nexport const builtHref = "/assets/style-1.css";\n',
		);
	}
	expect(call(main?.load, context("ssr", "serve"), [SHEET])).toBeNull();
	expect(call(main?.load, context("ssr"), ["/app/src/other.ts"])).toBeNull();
});

it("client graph", async () => {
	const client = `import { builtSheet } from ${JSON.stringify(SHEET)};\nimport "./app.css";\nconsole.log(builtSheet);`;
	const { css, js } = await built({ "client.ts": client, "app.css": "body{color:red}" }, false);
	expect(css[0]).toContain("color:red");
	expect(js).not.toContain("color:red");
	const plugins = inject({ reset: false, clientEntry: "src/client.ts" });
	call(plugins[1]?.generateBundle, context("client"), [{}, {}]);
	expect(call(plugins[0]?.load, context("client"), [SHEET])).toBeNull();
	expect(call(plugins[0]?.load, context("ssr"), [SHEET])).toContain('builtSheet = ""');
});

// flare() turns CSS code splitting off for the client, so a lazy chunk's CSS is in the one file too.
it("one sheet", async () => {
	const plugin = inject({ reset: false, clientEntry: "src/client.ts" })[0];
	expect(call(plugin?.configEnvironment, {}, ["client", {}, { command: "build" }])).toEqual({
		build: { cssCodeSplit: false },
	});
	expect(call(plugin?.configEnvironment, {}, ["ssr", {}, { command: "build" }])).toBeUndefined();
	const files = {
		"client.ts": 'import "./app.css";\nvoid import("./lazy.ts");',
		"lazy.ts": 'import "./lazy.css";\nexport const x = 1;',
		"app.css": ".a{color:red}",
		"lazy.css": ".b{color:blue}",
	};
	const { css } = await built(files, false);
	expect(css).toHaveLength(1);
	expect(css[0]).toContain(".b{color:");
});

// A sheet the parser refuses fails the build and names the file. A request never parses an unchecked sheet.
it("build parse", async () => {
	const files = { "client.ts": 'import "./app.css";', "app.css": '@import url("https://example.com/x.css");.a{top:0}' };
	await expect(built(files, false)).rejects.toThrow(/assets\/style-[\w-]+\.css.*@import/s);
	const capture = inject({ reset: false, clientEntry: "src/client.ts" })[1];
	for (const source of ['@charset "utf-8";.a{top:0}', ".a{top:0"]) {
		const bundle = { "style.css": asset("assets/style-1.css", source) };
		expect(() => call(capture?.generateBundle, context("client"), [{}, bundle])).toThrow(/assets\/style-1\.css/);
	}
	expect(call(capture?.generateBundle, context("ssr"), [{}, { "style.css": asset("x.css", "{") }])).toBeUndefined();
});
