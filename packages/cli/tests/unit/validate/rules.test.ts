import { describe, expect, it } from "vitest";
import type { EnrichedDefinition } from "../../../src/validate/rules";
import { runRules } from "../../../src/validate/rules";

function makeDef(overrides: Partial<EnrichedDefinition> = {}): EnrichedDefinition {
	return {
		authenticateMode: false,
		cache: {},
		chainMethods: {
			hasAuthorize: false,
			hasEffects: false,
			hasErrorRender: false,
			hasHead: false,
			hasHeaders: false,
			hasLoader: false,
			hasNotFoundRender: false,
			hasPreloader: false,
			hasRender: true,
			hasResponse: false,
			hasUnauthenticatedRender: false,
			hasUnauthorizedRender: false,
		},
		exportName: "route",
		filePath: "src/routes/test.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "test",
		...overrides,
	};
}

describe("runRules", () => {
	it("reports missing-root-layout", () => {
		const defs = [makeDef()];
		const result = runRules(defs, []);
		expect(result).toContainEqual(expect.objectContaining({ level: "error", rule: "missing-root-layout" }));
	});

	it("does not report missing-root-layout when present", () => {
		const defs = [makeDef({ type: "root-layout", virtualPath: "_root_" }), makeDef()];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "missing-root-layout")).toBeUndefined();
	});

	it("reports duplicate-routes from validation errors", () => {
		const defs = [makeDef({ type: "root-layout", virtualPath: "_root_" })];
		const result = runRules(defs, ["Duplicate page at '/about'"]);
		expect(result).toContainEqual(expect.objectContaining({ level: "error", rule: "duplicate-routes" }));
	});

	it("reports loader-no-error-boundary", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({
				chainMethods: {
					...makeDef().chainMethods,
					hasErrorRender: false,
					hasLoader: true,
				},
			}),
		];
		const result = runRules(defs, []);
		expect(result).toContainEqual(
			expect.objectContaining({
				level: "warning",
				rule: "loader-no-error-boundary",
			}),
		);
	});

	it("does not report loader-no-error-boundary when error boundary present", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({
				chainMethods: {
					...makeDef().chainMethods,
					hasErrorRender: true,
					hasLoader: true,
				},
			}),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "loader-no-error-boundary")).toBeUndefined();
	});

	it("reports auth-no-boundary", () => {
		const defs = [makeDef({ type: "root-layout", virtualPath: "_root_" }), makeDef({ authenticateMode: true })];
		const result = runRules(defs, []);
		expect(result).toContainEqual(expect.objectContaining({ level: "warning", rule: "auth-no-boundary" }));
	});

	it("does not report auth-no-boundary when unauthenticated render exists", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({
				authenticateMode: true,
				chainMethods: {
					...makeDef().chainMethods,
					hasUnauthenticatedRender: true,
				},
			}),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "auth-no-boundary")).toBeUndefined();
	});

	it("reports public-no-head", () => {
		const defs = [makeDef({ type: "root-layout", virtualPath: "_root_" }), makeDef({ authenticateMode: false })];
		const result = runRules(defs, []);
		expect(result).toContainEqual(expect.objectContaining({ level: "warning", rule: "public-no-head" }));
	});

	it("does not report public-no-head for response routes", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({ authenticateMode: false, responseRoute: true }),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "public-no-head")).toBeUndefined();
	});

	it("does not report public-no-head when head exists", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({
				authenticateMode: false,
				chainMethods: { ...makeDef().chainMethods, hasHead: true },
			}),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "public-no-head")).toBeUndefined();
	});

	it("reports public-no-cache", () => {
		const defs = [makeDef({ type: "root-layout", virtualPath: "_root_" }), makeDef({ authenticateMode: false })];
		const result = runRules(defs, []);
		expect(result).toContainEqual(expect.objectContaining({ level: "warning", rule: "public-no-cache" }));
	});

	it("does not report public-no-cache when ssg configured", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({ authenticateMode: false, cache: { ssg: true } }),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "public-no-cache")).toBeUndefined();
	});

	it("does not report public-no-cache when isr configured", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({ authenticateMode: false, cache: { isr: true } }),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "public-no-cache")).toBeUndefined();
	});

	it("reports suggest-prefetch as info", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({ cache: { client: { staleTime: 5000 } } }),
		];
		const result = runRules(defs, []);
		expect(result).toContainEqual(expect.objectContaining({ level: "info", rule: "suggest-prefetch" }));
	});

	it("does not report suggest-prefetch when prefetch is set", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({ cache: { client: { prefetch: "intent", staleTime: 5000 } } }),
		];
		const result = runRules(defs, []);
		expect(result.find((d) => d.rule === "suggest-prefetch")).toBeUndefined();
	});

	it("provides fix commands for warnings", () => {
		const defs = [
			makeDef({ type: "root-layout", virtualPath: "_root_" }),
			makeDef({
				authenticateMode: false,
				virtualPath: "about",
			}),
		];
		const result = runRules(defs, []);
		const headWarning = result.find((d) => d.rule === "public-no-head");
		expect(headWarning?.fix?.command).toBe("flare add head about");
	});
});
