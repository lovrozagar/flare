import { describe, expect, it } from "vitest";
import type { RouteDefinition } from "../../../src/generators/index.ts";
import { extractRouteDefinitions, generateRouteRegistry, generateRoutesFile } from "../../../src/generators/index.ts";

function makeDef(overrides: Partial<RouteDefinition>): RouteDefinition {
	return {
		authenticateMode: false,
		cache: {},
		exportName: "route",
		filePath: "src/routes/page.ts",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "_root_/x",
		...overrides,
	};
}

/* ── extractRouteDefinitions: auth mode detection ──────────────────── */

describe("extractRouteDefinitions — auth mode detection", () => {
	it("no .authenticate() → authenticateMode false", () => {
		const src = `export const route = createPage("_root_/x").render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(false);
	});

	it(".authenticate() → authenticateMode true", () => {
		const src = `export const route = createPage("_root_/x").authenticate().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
	});

	it(".authenticateOptional() → authenticateMode optional", () => {
		const src = `export const route = createPage("_root_/x").authenticateOptional().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
	});

	it(".authenticate() with args → still true", () => {
		const src = `export const route = createPage("_root_/x").authenticate("admin").render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
	});

	it(".authenticateOptional() with args → still optional", () => {
		const src = `export const route = createPage("_root_/x").authenticateOptional("viewer", "editor").render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
	});

	it(".authenticate() with whitespace before paren", () => {
		const src = `export const route = createPage("_root_/x").authenticate   ().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
	});

	it(".authenticateOptional() with whitespace before paren", () => {
		const src = `export const route = createPage("_root_/x").authenticateOptional   ().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
	});

	it(".authenticate() with newline before paren", () => {
		const src = `export const route = createPage("_root_/x").authenticate\n().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
	});

	it(".authenticateOptional() with newline before paren", () => {
		const src = `export const route = createPage("_root_/x").authenticateOptional\n().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
	});

	it(".authenticateOptional() takes priority over .authenticate() regex", () => {
		/* .authenticateOptional() contains "authenticate" so the .authenticate() regex also matches */
		const src = `export const route = createPage("_root_/x").authenticateOptional().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
	});

	it("two routes: first authenticate, second authenticateOptional", () => {
		const src = [
			`export const PageA = createPage("_root_/a").authenticate().render(() => null)`,
			`export const PageB = createPage("_root_/b").authenticateOptional().render(() => null)`,
		].join("\n");
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
		expect(defs[1]?.authenticateMode).toBe("optional");
	});

	it("two routes: first authenticateOptional, second authenticate", () => {
		const src = [
			`export const PageA = createPage("_root_/a").authenticateOptional().render(() => null)`,
			`export const PageB = createPage("_root_/b").authenticate().render(() => null)`,
		].join("\n");
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
		expect(defs[1]?.authenticateMode).toBe(true);
	});

	it("three routes: no auth, required, optional", () => {
		const src = [
			`export const PageA = createPage("_root_/a").render(() => null)`,
			`export const PageB = createPage("_root_/b").authenticate().render(() => null)`,
			`export const PageC = createPage("_root_/c").authenticateOptional().render(() => null)`,
		].join("\n");
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(false);
		expect(defs[1]?.authenticateMode).toBe(true);
		expect(defs[2]?.authenticateMode).toBe("optional");
	});

	it("layout with authenticate detection", () => {
		const src = `export const route = createLayout("_root_/(auth)").authenticate().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
		expect(defs[0]?.type).toBe("layout");
	});

	it("layout with authenticateOptional detection", () => {
		const src = `export const route = createLayout("_root_/(opt)").authenticateOptional().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
		expect(defs[0]?.type).toBe("layout");
	});

	it("root layout with authenticate detection", () => {
		const src = `export const route = createRootLayout("_root_").authenticate().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
		expect(defs[0]?.type).toBe("root-layout");
	});

	it("root layout with authenticateOptional detection", () => {
		const src = `export const route = createRootLayout("_root_").authenticateOptional().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
		expect(defs[0]?.type).toBe("root-layout");
	});

	it("chain with .cache() before .authenticate()", () => {
		const src = `export const route = createPage("_root_/x").cache({ client: { staleTime: 5000 } }).authenticate().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
		expect(defs[0]?.cache.client?.staleTime).toBe(5000);
	});

	it("chain with .cache() before .authenticateOptional()", () => {
		const src = `export const route = createPage("_root_/x").cache({ client: { staleTime: 5000 } }).authenticateOptional().render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
		expect(defs[0]?.cache.client?.staleTime).toBe(5000);
	});

	it("response route with .authenticate()", () => {
		const src = `export const route = createPage("_root_/api").authenticate().response(() => new Response())`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(true);
		expect(defs[0]?.responseRoute).toBe(true);
	});

	it("response route with .authenticateOptional()", () => {
		const src = `export const route = createPage("_root_/api").authenticateOptional().response(() => new Response())`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe("optional");
		expect(defs[0]?.responseRoute).toBe(true);
	});

	it("word 'authenticate' in a string literal does NOT match", () => {
		const src = `export const route = createPage("_root_/x").render(() => "we authenticate users")`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(false);
	});

	it("word 'authenticateOptional' in a string literal does NOT match (no dot prefix)", () => {
		const src = `export const route = createPage("_root_/x").render(() => "authenticateOptional is cool")`;
		const defs = extractRouteDefinitions(src, "f.ts");
		expect(defs[0]?.authenticateMode).toBe(false);
	});

	it("comment containing .authenticate() inside chain scope — may match (regex limitation)", () => {
		/* Known limitation: regex doesn't distinguish comments from code */
		const src = `export const route = createPage("_root_/x")
/* .authenticate() */
.render(() => null)`;
		const defs = extractRouteDefinitions(src, "f.ts");
		/* Regex DOES match inside comments — this is a known trade-off */
		expect(defs[0]?.authenticateMode).toBe(true);
	});
});

/* ── generateRoutesFile — auth mode in route meta ──────────────────── */

describe("generateRoutesFile — auth mode in route meta", () => {
	it("authenticateMode true → authenticate: true in meta", () => {
		const defs = [makeDef({ authenticateMode: true, filePath: "routes/p.ts", virtualPath: "_root_/p" })];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).toContain("authenticate: true");
	});

	it('authenticateMode optional → authenticate: "optional" in meta', () => {
		const defs = [makeDef({ authenticateMode: "optional", filePath: "routes/p.ts", virtualPath: "_root_/p" })];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).toContain('authenticate: "optional"');
	});

	it("authenticateMode false → no authenticate in meta", () => {
		const defs = [makeDef({ authenticateMode: false, filePath: "routes/p.ts", virtualPath: "_root_/p" })];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).not.toContain("authenticate:");
	});

	it("multiple routes: mixed auth modes in meta", () => {
		const defs = [
			makeDef({ authenticateMode: true, filePath: "routes/a.ts", virtualPath: "_root_/a" }),
			makeDef({ authenticateMode: "optional", filePath: "routes/b.ts", virtualPath: "_root_/b" }),
			makeDef({ authenticateMode: false, filePath: "routes/c.ts", virtualPath: "_root_/c" }),
		];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).toContain("authenticate: true");
		expect(code).toContain('authenticate: "optional"');
	});

	it("authenticate + cache combined in meta", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				cache: { client: { staleTime: 5000 } },
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).toContain("authenticate: true");
		expect(code).toContain("staleTime: 5000");
	});

	it("authenticateOptional + cache combined in meta", () => {
		const defs = [
			makeDef({
				authenticateMode: "optional",
				cache: { client: { gcTime: 10000 } },
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		];
		const code = generateRoutesFile(defs, "src/_gen");
		expect(code).toContain('authenticate: "optional"');
		expect(code).toContain("gcTime: 10000");
	});
});

/* ── generateRouteRegistry — authModes section ─────────────────────── */

describe("generateRouteRegistry — authModes section", () => {
	it("single required auth → authModes with true", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain("authModes:");
		expect(result).toContain('"_root_": true');
	});

	it("single optional auth → authModes with optional", () => {
		const defs = [
			makeDef({
				authenticateMode: "optional",
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain("authModes:");
		expect(result).toContain('"_root_": "optional"');
	});

	it("no auth routes → no authModes section", () => {
		const defs = [
			makeDef({
				authenticateMode: false,
				filePath: "routes/about.ts",
				virtualPath: "_root_/about",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).not.toContain("authModes:");
	});

	it("mixed: required + optional + false → only non-false in authModes", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				authenticateMode: "optional",
				filePath: "routes/opt.ts",
				type: "layout",
				virtualPath: "_root_/(opt)",
			}),
			makeDef({
				authenticateMode: false,
				filePath: "routes/about.ts",
				virtualPath: "_root_/about",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain("authModes:");
		expect(result).toContain('"_root_": true');
		expect(result).toContain('"_root_/(opt)": "optional"');
		const authModesBlock = result.slice(result.indexOf("authModes:"));
		expect(authModesBlock).not.toContain("_root_/about");
	});

	it("multiple required → all listed", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				authenticateMode: true,
				filePath: "routes/auth.ts",
				type: "layout",
				virtualPath: "_root_/(auth)",
			}),
			makeDef({
				authenticateMode: true,
				filePath: "routes/dash.ts",
				virtualPath: "_root_/(auth)/dash",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain('"_root_": true');
		expect(result).toContain('"_root_/(auth)": true');
		expect(result).toContain('"_root_/(auth)/dash": true');
	});

	it("multiple optional → all listed", () => {
		const defs = [
			makeDef({
				authenticateMode: "optional",
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({ authenticateMode: "optional", filePath: "routes/a.ts", virtualPath: "_root_/a" }),
			makeDef({ authenticateMode: "optional", filePath: "routes/b.ts", virtualPath: "_root_/b" }),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain('"_root_": "optional"');
		expect(result).toContain('"_root_/a": "optional"');
		expect(result).toContain('"_root_/b": "optional"');
	});

	it("response routes excluded from authModes (filtered out with moduleDefs)", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/api.ts",
				responseRoute: true,
				virtualPath: "_root_/api",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		/* response routes are excluded from moduleDefs, so no authModes emitted */
		expect(result).not.toContain("authModes:");
	});

	it("layout + page: only layout has auth → only layout in authModes", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				authenticateMode: false,
				filePath: "routes/about.ts",
				virtualPath: "_root_/about",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain("authModes:");
		expect(result).toContain('"_root_": true');
		const authBlock = result.slice(result.indexOf("authModes:"));
		expect(authBlock).not.toContain("_root_/about");
	});

	it("authModes section appears inside FlareRegister block", () => {
		const defs = [
			makeDef({
				authenticateMode: true,
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
		];
		const result = generateRouteRegistry(defs, "src/_gen");
		const flareRegisterStart = result.indexOf("FlareRegister");
		const authModesStart = result.indexOf("authModes:");
		expect(authModesStart).toBeGreaterThan(flareRegisterStart);
	});

	it("authModes with 10 routes — large tree", () => {
		const defs = Array.from({ length: 10 }, (_, i) =>
			makeDef({
				authenticateMode: i % 3 === 0 ? true : i % 3 === 1 ? "optional" : false,
				filePath: `routes/p${i}.ts`,
				type: i === 0 ? "root-layout" : "page",
				virtualPath: i === 0 ? "_root_" : `_root_/p${i}`,
			}),
		);
		const result = generateRouteRegistry(defs, "src/_gen");
		expect(result).toContain("authModes:");
		/* indices 0,3,6,9 are true; 1,4,7 are optional; 2,5,8 are false */
		expect(result).toContain('"_root_": true');
		expect(result).toContain('"_root_/p3": true');
		expect(result).toContain('"_root_/p6": true');
		expect(result).toContain('"_root_/p9": true');
		expect(result).toContain('"_root_/p1": "optional"');
		expect(result).toContain('"_root_/p4": "optional"');
		expect(result).toContain('"_root_/p7": "optional"');
	});
});
