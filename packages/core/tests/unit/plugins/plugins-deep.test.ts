import { existsSync, mkdirSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@solidjs/vite-plugin", () => ({
	default: () => ({ name: "solid" }),
}));

/* flare() needs src/client.tsx and src/server.ts at cwd */
const _stubs: string[] = [];
const _stubDirs: string[] = [];
for (const name of ["src/client.tsx", "src/server.ts"]) {
	const p = join(process.cwd(), name);
	if (!existsSync(p)) {
		writeFileSync(p, "/* test stub */");
		_stubs.push(p);
	}
}
const _distDir = join(process.cwd(), "dist");
if (!existsSync(_distDir)) {
	mkdirSync(_distDir, { recursive: true });
	_stubDirs.push(_distDir);
}

afterAll(() => {
	const { unlinkSync, rmdirSync: rmdir } = require("node:fs");
	for (const p of _stubs)
		try {
			unlinkSync(p);
		} catch {}
	for (const d of _stubDirs)
		try {
			rmdir(d);
		} catch {}
});

vi.mock("../../../src/generators", () => ({
	buildRouteTree: vi.fn(() => ({ s: {} })),
	deriveVirtualPath: vi.fn(() => "_root_/test"),
	detectRouteType: vi.fn(() => "page"),
	extractCacheFromChain: vi.fn(() => ({})),
	extractRouteDefinitions: vi.fn(() => []),
	generateLayoutsRecord: vi.fn(),
	generateRouteInserts: vi.fn(),
	generateRoutesFile: vi.fn(),
	generateVirtualModuleTypes: vi.fn(() => ""),
	runGenerate: vi.fn(() => ({ layouts: 0, routes: 0 })),
	scanSourceFiles: vi.fn(() => []),
	scanSourceFilesFsCodegen: vi.fn(() => []),
	serializeTreeNode: vi.fn(() => "{ s: E }"),
	validateRouteDefinitions: vi.fn(() => []),
	writeRouteDeclaration: vi.fn(),
}));

import {
	createCssTransformPlugin,
	createServerFnPlugin,
	flare,
	scanServerFnFiles,
	stripHandlerBodies,
	transformEnvFns,
} from "../../../src/plugins/index.ts";

/* ── 5.1 transformEnvFns ─────────────────────────────────────────────── */

describe("transformEnvFns", () => {
	it("createServerOnlyFn on client → body stripped, returns throwing stub", () => {
		const code = "const fn = createServerOnlyFn((x) => x * 2)";
		const result = transformEnvFns(code, false);
		expect(result).toContain("Server-only function called on client");
		expect(result).not.toContain("x * 2");
	});

	it("createServerOnlyFn on SSR → body preserved", () => {
		const code = "const fn = createServerOnlyFn((x) => x * 2)";
		const result = transformEnvFns(code, true);
		expect(result).toContain("x * 2");
		expect(result).not.toContain("Server-only");
	});

	it("createClientOnlyFn on SSR → body stripped", () => {
		const code = "const fn = createClientOnlyFn(() => window.innerWidth)";
		const result = transformEnvFns(code, true);
		expect(result).toContain("Client-only function called on server");
		expect(result).not.toContain("window.innerWidth");
	});

	it("createClientOnlyFn on client → body preserved", () => {
		const code = "const fn = createClientOnlyFn(() => window.innerWidth)";
		const result = transformEnvFns(code, false);
		expect(result).toContain("window.innerWidth");
		expect(result).not.toContain("Client-only");
	});

	it("createIsomorphicFn → .server() on SSR", () => {
		const code = "const fn = createIsomorphicFn().server(() => serverLogic()).client(() => clientLogic())";
		const result = transformEnvFns(code, true);
		expect(result).toContain("serverLogic");
		expect(result).not.toContain("clientLogic");
	});

	it("createIsomorphicFn → .client() on client", () => {
		const code = "const fn = createIsomorphicFn().server(() => serverLogic()).client(() => clientLogic())";
		const result = transformEnvFns(code, false);
		expect(result).toContain("clientLogic");
		expect(result).not.toContain("serverLogic");
	});

	it("nested parens in fn body → correct depth tracking", () => {
		const code = "const fn = createServerOnlyFn((x) => fn1(fn2(fn3(x))))";
		const result = transformEnvFns(code, true);
		expect(result).toContain("fn1(fn2(fn3(x)))");
	});

	it("multiple env fns in same file → all transformed", () => {
		const code = [
			"const a = createServerOnlyFn(() => secret1())",
			"const b = createClientOnlyFn(() => secret2())",
		].join("\n");
		const result = transformEnvFns(code, false);
		expect(result).toContain("Server-only function called on client");
		expect(result).toContain("secret2");
		expect(result).not.toContain("secret1");
	});

	it("no env fns → code returned unchanged", () => {
		const code = "const x = 42\nconst y = x + 1";
		const result = transformEnvFns(code, true);
		expect(result).toBe(code);
	});

	it("template literal in fn body → parens inside do not break parsing", () => {
		const code = "const fn = createServerOnlyFn(() => `result(${a + b})`)";
		const result = transformEnvFns(code, true);
		expect(result).toContain("result(${a + b})");
	});

	it("createIsomorphicFn with only .server() → noop on client", () => {
		const code = "const fn = createIsomorphicFn().server(() => serverOnly())";
		const result = transformEnvFns(code, false);
		expect(result).toContain("undefined");
		expect(result).not.toContain("serverOnly");
	});

	it("createIsomorphicFn with only .client() → noop on SSR", () => {
		const code = "const fn = createIsomorphicFn().client(() => clientOnly())";
		const result = transformEnvFns(code, true);
		expect(result).toContain("undefined");
		expect(result).not.toContain("clientOnly");
	});
});

/* ── 5.2 scanServerFnFiles ───────────────────────────────────────────── */

describe("scanServerFnFiles", () => {
	const testDir = join(process.cwd(), "__scan_test_dir__");

	afterAll(() => {
		try {
			const { rmSync } = require("node:fs");
			rmSync(testDir, { force: true, recursive: true });
		} catch {}
	});

	function setup() {
		try {
			const { rmSync } = require("node:fs");
			rmSync(testDir, { force: true, recursive: true });
		} catch {}
		mkdirSync(join(testDir, "nested"), { recursive: true });
		mkdirSync(join(testDir, "_gen"), { recursive: true });
	}

	it("finds files with createServerFn in nested dirs", () => {
		setup();
		writeFileSync(join(testDir, "api.ts"), 'import { createServerFn } from "@lovrozagar/flare"');
		writeFileSync(join(testDir, "nested/deep.ts"), "const fn = createServerFn({ name: 'x' })");
		writeFileSync(join(testDir, "utils.ts"), "export const x = 42");

		const result = scanServerFnFiles(testDir);
		expect(result.length).toBe(2);
		expect(result.some((f) => f.includes("api.ts"))).toBe(true);
		expect(result.some((f) => f.includes("deep.ts"))).toBe(true);
		expect(result.some((f) => f.includes("utils.ts"))).toBe(false);
	});

	it("skips _gen/ directories", () => {
		setup();
		writeFileSync(join(testDir, "_gen/routes.gen.ts"), "createServerFn({ name: 'gen' })");
		writeFileSync(join(testDir, "real.ts"), "createServerFn({ name: 'real' })");

		const result = scanServerFnFiles(testDir);
		expect(result.length).toBe(1);
		expect(result[0]).toContain("real.ts");
	});

	it("skips *.gen.* files", () => {
		setup();
		writeFileSync(join(testDir, "routes.gen.ts"), "createServerFn({ name: 'gen' })");
		writeFileSync(join(testDir, "api.ts"), "createServerFn({ name: 'api' })");

		const result = scanServerFnFiles(testDir);
		expect(result.length).toBe(1);
		expect(result[0]).toContain("api.ts");
	});

	it("returns sorted absolute paths", () => {
		setup();
		writeFileSync(join(testDir, "z-file.ts"), "createServerFn({})");
		writeFileSync(join(testDir, "a-file.ts"), "createServerFn({})");

		const result = scanServerFnFiles(testDir);
		expect(result.length).toBe(2);
		/* sorted: a-file before z-file */
		expect(result[0]).toContain("a-file.ts");
		expect(result[1]).toContain("z-file.ts");
	});

	it("empty directory → empty array", () => {
		setup();
		const result = scanServerFnFiles(testDir);
		expect(result).toEqual([]);
	});
});

/* ── 5.3 computeFnId ─────────────────────────────────────────────────── */

describe("computeFnId (via plugin transform)", () => {
	it("deterministic: same input → same output", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = 'const fn = createServerFn({ name: "test" })';
		const r1 = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");
		const r2 = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");
		expect(r1?.code).toBe(r2?.code);
	});

	it("different file → different ID", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = 'const fn = createServerFn({ name: "test" })';
		const r1 = transform.call({ environment: { name: "ssr" } }, code, "src/api-a.ts");
		const r2 = transform.call({ environment: { name: "ssr" } }, code, "src/api-b.ts");
		expect(r1?.code).not.toBe(r2?.code);
	});

	it("different content → different ID", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code1 = 'const fn = createServerFn({ name: "alpha" })';
		const code2 = 'const fn = createServerFn({ name: "beta" })';
		const r1 = transform.call({ environment: { name: "ssr" } }, code1, "src/api.ts");
		const r2 = transform.call({ environment: { name: "ssr" } }, code2, "src/api.ts");
		expect(r1?.code).not.toBe(r2?.code);
	});
});

/* ── 5.4 stripHandlerBodies deep ─────────────────────────────────────── */

describe("stripHandlerBodies deep", () => {
	it("handler with nested function definitions inside", () => {
		const code = ".handler(({ input }) => { function inner() { return secret() } return inner() })";
		const result = stripHandlerBodies(code);
		expect(result).toContain("Server function called on client");
		expect(result).not.toContain("secret");
		expect(result).not.toContain("function inner");
	});

	it(".stream() with yield and for await", () => {
		const code = ".stream(async function* (ctx) { for await (const chunk of source) { yield process(chunk) } })";
		const result = stripHandlerBodies(code);
		expect(result).toContain("Server function called on client");
		expect(result).not.toContain("for await");
		expect(result).not.toContain("yield process");
	});

	it("multiple .handler() in same file → all stripped", () => {
		const code = [
			'createServerFn({ name: "a" }).handler(() => secretA())',
			'createServerFn({ name: "b" }).handler(() => secretB())',
			'createServerFn({ name: "c" }).handler(() => secretC())',
		].join("\n");
		const result = stripHandlerBodies(code);
		expect(result).not.toContain("secretA");
		expect(result).not.toContain("secretB");
		expect(result).not.toContain("secretC");
		expect((result.match(/Server function called on client/g) ?? []).length).toBe(3);
	});

	it("no .handler() or .stream() → unchanged", () => {
		const code = 'const fn = createServerFn({ name: "test" }).input(z.object({}))';
		const result = stripHandlerBodies(code);
		expect(result).toBe(code);
	});

	it("handler calling another handler (meta pattern)", () => {
		const code = ".handler(async ({ input }) => { return otherFn.handler(input.nested) })";
		const result = stripHandlerBodies(code);
		expect(result).toContain("Server function called on client");
		expect(result).not.toContain("otherFn");
	});
});

/* ── 5.5 Preview server plugin ───────────────────────────────────────── */

function isPlugin(p: import("vite").PluginOption): p is Plugin {
	return typeof p === "object" && p !== null && "name" in p;
}

describe("preview server plugin", () => {
	function getPreviewPlugin() {
		const plugins = flare({}).filter(isPlugin);
		return plugins.find((p) => p.name === "flare:preview-server");
	}

	it("serves JS with correct MIME and cache headers", async () => {
		const root = join(process.cwd(), "__preview_test__");
		const clientDir = join(root, "dist/client/assets");
		try {
			mkdirSync(clientDir, { recursive: true });
			writeFileSync(join(clientDir, "test.js"), "console.log('hello')");

			const previewPlugin = getPreviewPlugin();
			const configure = previewPlugin?.configurePreviewServer as (server: unknown) => (() => void) | undefined;

			if (!configure) throw new Error("configurePreviewServer not found");

			let capturedHandler: ((req: unknown, res: unknown, next: unknown) => void) | undefined;
			const mockPreview = {
				config: { root },
				middlewares: {
					use(fn: typeof capturedHandler) {
						capturedHandler = fn;
					},
				},
			};

			const postHook = configure(mockPreview);
			postHook?.();

			const headers: Record<string, string> = {};
			let statusCode = 0;

			await capturedHandler?.(
				{ headers: {}, url: "/assets/test.js" },
				{
					end() {},
					writeHead(status: number, hdrs: Record<string, string>) {
						statusCode = status;
						Object.assign(headers, hdrs);
					},
				},
				() => {},
			);

			expect(statusCode).toBe(200);
			expect(headers["content-type"]).toBe("application/javascript");
			expect(headers["cache-control"]).toContain("immutable");
		} finally {
			const { rmSync } = await import("node:fs");
			try {
				rmSync(root, { force: true, recursive: true });
			} catch {}
		}
	});

	it("serves CSS with correct MIME", async () => {
		const root = join(process.cwd(), "__preview_css_test__");
		const clientDir = join(root, "dist/client/assets");
		try {
			mkdirSync(clientDir, { recursive: true });
			writeFileSync(join(clientDir, "style.css"), "body { margin: 0; }");

			const previewPlugin = getPreviewPlugin();
			const configure = previewPlugin?.configurePreviewServer as (server: unknown) => (() => void) | undefined;

			if (!configure) throw new Error("configurePreviewServer not found");

			let capturedHandler: ((req: unknown, res: unknown, next: unknown) => void) | undefined;
			const mockPreview = {
				config: { root },
				middlewares: {
					use(fn: typeof capturedHandler) {
						capturedHandler = fn;
					},
				},
			};

			const postHook = configure(mockPreview);
			postHook?.();

			const headers: Record<string, string> = {};
			let statusCode = 0;

			await capturedHandler?.(
				{ headers: {}, url: "/assets/style.css" },
				{
					end() {},
					writeHead(status: number, hdrs: Record<string, string>) {
						statusCode = status;
						Object.assign(headers, hdrs);
					},
				},
				() => {},
			);

			expect(statusCode).toBe(200);
			expect(headers["content-type"]).toBe("text/css");
		} finally {
			const { rmSync } = await import("node:fs");
			try {
				rmSync(root, { force: true, recursive: true });
			} catch {}
		}
	});

	it("non-asset path falls through to next (SSR)", async () => {
		const root = join(process.cwd(), "__preview_fallthrough__");
		try {
			mkdirSync(join(root, "dist/client"), { recursive: true });

			const previewPlugin = getPreviewPlugin();
			const configure = previewPlugin?.configurePreviewServer as (server: unknown) => (() => void) | undefined;

			if (!configure) throw new Error("configurePreviewServer not found");

			let capturedHandler: ((req: unknown, res: unknown, next: unknown) => void) | undefined;
			const mockPreview = {
				config: { root },
				middlewares: {
					use(fn: typeof capturedHandler) {
						capturedHandler = fn;
					},
				},
			};

			const postHook = configure(mockPreview);
			postHook?.();

			let nextCalled = false;
			await capturedHandler?.(
				{ headers: {}, url: "/about" },
				{
					end() {},
					writeHead() {},
				},
				(err?: unknown) => {
					nextCalled = true;
				},
			);
			expect(nextCalled).toBe(true);
		} finally {
			const { rmSync } = await import("node:fs");
			try {
				rmSync(root, { force: true, recursive: true });
			} catch {}
		}
	});
});

/* ── 5.6 stripLayerWrappers deep ─────────────────────────────────────── */

describe("stripLayerWrappers deep (via CSS transform plugin)", () => {
	const plugin = createCssTransformPlugin();
	const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

	it("nested @layer → both stripped", () => {
		const css = "@layer base { @layer inner { .card { padding: 1rem; } } }";
		const result = transform.call({}, css, "style.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain(".card { padding: 1rem; }");
	});

	it("@layer with multiple selectors inside", () => {
		const css = "@layer utils { .flex { display: flex; } .grid { display: grid; } .hidden { display: none; } }";
		const result = transform.call({}, css, "style.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain(".flex { display: flex; }");
		expect(result?.code).toContain(".grid { display: grid; }");
		expect(result?.code).toContain(".hidden { display: none; }");
	});

	it("no @layer → unchanged (returns null)", () => {
		const css = "body { margin: 0; }";
		const result = transform.call({}, css, "style.css");
		expect(result).toBeNull();
	});

	it("@layer with braces in content (nested media query)", () => {
		const css = "@layer components { @media (min-width: 768px) { .grid { columns: 2; } } }";
		const result = transform.call({}, css, "style.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("@media (min-width: 768px)");
		expect(result?.code).toContain(".grid { columns: 2; }");
	});

	it("empty @layer → empty output", () => {
		const css = "@layer empty {}";
		const result = transform.call({}, css, "style.css");
		expect(result?.code?.trim()).toBe("");
	});

	it("@layer combined with @theme → both transformed", () => {
		const css = "@theme { --color: red; }\n@layer base { body { color: var(--color); } }";
		const result = transform.call({}, css, "style.css");
		expect(result?.code).toContain(":root");
		expect(result?.code).not.toContain("@theme");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("body { color: var(--color); }");
	});
});

/* ── env fn plugin integration via transform ─────────────────────────── */

describe("env fn plugin integration", () => {
	it("SSR transform preserves createServerOnlyFn body", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
		const code = "const fn = createServerOnlyFn((req) => handleRequest(req))";
		const result = transform.call({ environment: { name: "ssr" } }, code, "src/utils.ts");
		expect(result?.code).toContain("handleRequest");
	});

	it("client transform strips createServerOnlyFn body", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
		const code = "const fn = createServerOnlyFn((req) => handleRequest(req))";
		const result = transform.call({ environment: { name: "client" } }, code, "src/utils.ts");
		expect(result?.code).not.toContain("handleRequest");
		expect(result?.code).toContain("Server-only function called on client");
	});

	it("env-fn files (containing /env-fn/) are NOT transformed", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
		const code = "export function createServerOnlyFn(fn) { return fn }";
		const result = transform.call({ environment: { name: "ssr" } }, code, "src/env-fn/index.ts");
		expect(result).toBeNull();
	});
});
