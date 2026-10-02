// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractRouteDefinitions, scanSourceFilesFsCodegen } from "../../../src/generators/index.ts";
import type { ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { runPipeline } from "../../../src/loader-pipeline/index.ts";
import type { AuthenticateMode } from "../../../src/route-builder/index.ts";
import { createLayout, createPage, createRootLayout } from "../../../src/route-builder/index.ts";

/**
 * Every supported auth chain form. Builder state, both codegen scans, and the
 * README must agree with this table.
 */
const FORMS: ReadonlyArray<{ callerData: unknown[] | undefined; chain: string; mode: AuthenticateMode }> = [
	{ callerData: undefined, chain: "", mode: false },
	{ callerData: [], chain: ".authenticate()", mode: true },
	{ callerData: ["admin"], chain: '.authenticate("admin")', mode: true },
	{ callerData: [], chain: '.authenticate("optional")', mode: "optional" },
	{ callerData: ["viewer"], chain: '.authenticate("optional", "viewer")', mode: "optional" },
	{ callerData: [], chain: ".authenticateOptional()", mode: "optional" },
	{ callerData: ["viewer"], chain: '.authenticateOptional("viewer")', mode: "optional" },
];

const BUILDERS = [
	{ create: () => createPage("_root_/x"), name: "createPage", source: 'createPage("_root_/x")' },
	{ create: () => createLayout("_root_/(g)"), name: "createLayout", source: 'createLayout("_root_/(g)")' },
	{ create: () => createRootLayout("_root_"), name: "createRootLayout", source: 'createRootLayout("_root_")' },
];

function applyChain(
	builder: unknown,
	chain: string,
): { authenticate?: unknown[]; authenticateMode?: AuthenticateMode } {
	const chained = new Function("b", `return b${chain}`)(builder) as { render: (fn: () => null) => unknown };
	return chained.render(() => null) as { authenticate?: unknown[]; authenticateMode?: AuthenticateMode };
}

describe.each(FORMS)("auth form `$chain`", ({ callerData, chain, mode }) => {
	it.each(BUILDERS)("$name builder state", ({ create }) => {
		const result = applyChain(create(), chain);
		expect(result.authenticateMode ?? false).toBe(mode);
		expect(result.authenticate).toEqual(callerData);
	});

	it.each(BUILDERS)("$name file-chain codegen", ({ source }) => {
		const defs = extractRouteDefinitions(`export const route = ${source}${chain}.render(() => null)`, "f.tsx");
		expect(defs[0]?.authenticateMode).toBe(mode);
	});

	it("fs-routes codegen", () => {
		const dir = mkdtempSync(join(tmpdir(), "flare-auth-forms-"));
		try {
			mkdirSync(join(dir, "src/routes/_root_/x"), { recursive: true });
			writeFileSync(
				join(dir, "src/routes/_root_/x/x.page.tsx"),
				`export const route = createPage("_root_/x")${chain}.render(() => null)`,
			);
			const defs = scanSourceFilesFsCodegen({ rootDir: dir });
			expect(defs[0]?.authenticateMode).toBe(mode);
		} finally {
			rmSync(dir, { force: true, recursive: true });
		}
	});

	it("anonymous request outcome", async () => {
		let loaderAuth: unknown = "not-called";
		const page = new Function("b", `return b${chain}`)(createPage("_root_/x")).render(() => null) as ResolvedRoute;
		const route = {
			...page,
			loader: (ctx: { auth: unknown }) => {
				loaderAuth = ctx.auth;
				return {};
			},
			variablePath: "/x",
			virtualPath: "_root_/x",
		} as ResolvedRoute;
		const result = await runPipeline({
			abortController: new AbortController(),
			authenticateFn: vi.fn(() => Promise.resolve(null)),
			cause: "enter",
			env: {},
			prefetch: false,
			request: new Request("http://localhost/x"),
			routes: [route],
			url: new URL("http://localhost/x"),
		});
		const blocked = JSON.stringify(result).includes("Unauthenticated") || loaderAuth === "not-called";
		expect(blocked).toBe(mode === true);
		if (mode !== true) expect(loaderAuth).toBeNull();
	});
});

describe("README auth forms", () => {
	const root = resolve(import.meta.dirname, "../../../../..");
	const readmes = [join(root, "README.md"), join(root, "packages/core/README.md")];

	it.each(readmes)("every route auth form in %s is in the table", (path) => {
		const text = readFileSync(path, "utf-8");
		const documented = [...text.matchAll(/\.authenticate(?:Optional)?\([^)`]*\)/g)].map((m) => m[0]);
		expect(documented.length).toBeGreaterThan(0);
		const known = new Set(FORMS.map((f) => f.chain));
		expect(documented.filter((form) => !known.has(form))).toEqual([]);
	});
});
