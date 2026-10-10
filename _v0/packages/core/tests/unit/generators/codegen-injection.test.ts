import { describe, expect, it } from "vitest";
import {
	generateLayoutsRecord,
	generateRouteInserts,
	generateRouteRegistry,
	type RouteDefinition,
	writeRouteDeclaration,
} from "../../../src/generators/index.ts";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

/* ── Issue #2/3: String injection in generated code ─────────────────── */

describe("codegen string injection — generateRouteInserts", () => {
	const outputDir = "/out";

	it("double quotes in virtualPath are escaped", () => {
		const def = makeDef({ virtualPath: `_root_/"; process.exit(1); "` });
		const code = generateRouteInserts([def], outputDir);
		expect(code).not.toContain(`""; process.exit(1); ""`);
		/* The virtualPath value must be a valid JS string literal */
		expect(code).toContain(`\\"`);
	});

	it("backslash in virtualPath is escaped", () => {
		const def = makeDef({ virtualPath: `_root_/test\\path` });
		const code = generateRouteInserts([def], outputDir);
		/* Raw backslash must be doubled in generated string */
		expect(code).toContain(`\\\\`);
	});

	it("newline in exportName is escaped", () => {
		const def = makeDef({ exportName: "route\nmalicious" });
		const code = generateRouteInserts([def], outputDir);
		/* Literal newline must not appear in generated code */
		expect(code.split("\n").every((line) => !line.includes("malicious") || line.includes("\\n"))).toBe(true);
	});

	it("double quotes in exportName are escaped", () => {
		const def = makeDef({ exportName: `route"injection` });
		const code = generateRouteInserts([def], outputDir);
		expect(code).not.toContain(`"route"injection"`);
		expect(code).toContain(`route\\"injection`);
	});

	it("backtick in virtualPath does not break template", () => {
		const def = makeDef({ virtualPath: "_root_/te`st" });
		const code = generateRouteInserts([def], outputDir);
		/* Generated code uses double quotes, backtick should pass through harmlessly
		 * but must not produce invalid syntax */
		expect(() => new Function(code.replace(/import\(/g, "void("))).not.toThrow();
	});
});

describe("codegen string injection — intercept config (formatRouteMeta)", () => {
	const outputDir = "/out";

	it("double quotes in intercept.from are escaped", () => {
		const def = makeDef({
			intercept: {
				from: [`_root_/"; alert("xss`],
				render: "modal",
			},
		});
		const code = generateRouteInserts([def], outputDir);
		expect(code).not.toContain(`"_root_/"; alert("xss"`);
		expect(code).toContain(`\\"`);
	});

	it("double quotes in intercept.render are escaped", () => {
		const def = makeDef({
			intercept: {
				from: ["_root_/home"],
				render: `modal"; console.log("pwned`,
			},
		});
		const code = generateRouteInserts([def], outputDir);
		expect(code).not.toContain(`"modal"; console.log("pwned"`);
	});

	it("backslash in intercept.from is escaped", () => {
		const def = makeDef({
			intercept: {
				from: [`_root_/path\\with\\slashes`],
				render: "modal",
			},
		});
		const code = generateRouteInserts([def], outputDir);
		expect(code).toContain(`\\\\`);
	});
});

describe("codegen string injection — generateLayoutsRecord", () => {
	const outputDir = "/out";

	it("double quotes in layout virtualPath are escaped", () => {
		const def = makeDef({
			exportName: "layout",
			filePath: "src/routes/layout.ts",
			type: "layout",
			virtualPath: `_root_/"; evil(); "`,
		});
		const code = generateLayoutsRecord([def], outputDir);
		expect(code).not.toContain(`"_root_/"; evil(); ""`);
		expect(code).toContain(`\\"`);
	});

	it("double quotes in layout exportName are escaped", () => {
		const def = makeDef({
			exportName: `layout"inject`,
			filePath: "src/routes/layout.ts",
			type: "layout",
			virtualPath: "_root_",
		});
		const code = generateLayoutsRecord([def], outputDir);
		expect(code).not.toContain(`m.layout"inject`);
		expect(code).toContain(`layout\\"inject`);
	});

	it("double quotes in layout filePath are escaped", () => {
		const def = makeDef({
			exportName: "layout",
			filePath: `src/routes/la"yout.ts`,
			type: "layout",
			virtualPath: "_root_",
		});
		const code = generateLayoutsRecord([def], outputDir);
		expect(code).not.toContain(`"src/routes/la"yout.ts"`);
	});
});

describe("codegen string injection — writeRouteDeclaration", () => {
	let tmpDir: string;

	it("double quotes in virtualPath are escaped in declaration", () => {
		tmpDir = join(tmpdir(), `flare-codegen-test-${Date.now()}`);
		mkdirSync(tmpDir, { recursive: true });
		const filePath = join(tmpDir, "page.ts");
		writeFileSync(filePath, `export const route = createPage("_root_/old")`);

		writeRouteDeclaration(filePath, `_root_/"; process.exit(1); "`, "page");
		const result = readFileSync(filePath, "utf-8");

		expect(result).not.toContain(`"_root_/"; process.exit(1); ""`);
		expect(result).toContain(`\\"`);

		rmSync(tmpDir, { force: true, recursive: true });
	});
});

describe("codegen string injection — generateRouteRegistry", () => {
	const outputDir = "/out";

	it("double quotes in virtualPath are escaped in type registry", () => {
		const def = makeDef({ virtualPath: `_root_/"; evil(); "` });
		const code = generateRouteRegistry([def], outputDir, false, false);
		expect(code).not.toContain(`"_root_/"; evil(); ""`);
	});

	it("double quotes in exportName are escaped in type registry", () => {
		const def = makeDef({ exportName: `route"inject` });
		const code = generateRouteRegistry([def], outputDir, false, false);
		expect(code).not.toContain(`["route"inject"]`);
	});
});
