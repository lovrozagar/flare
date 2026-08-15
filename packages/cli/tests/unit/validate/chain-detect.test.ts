import { describe, expect, it } from "vitest";
import { detectAllChains, detectChainMethods, extractChainScope } from "../../../src/validate/chain-detect";

describe("extractChainScope", () => {
	it("extracts scope to next export const", () => {
		const source = `export const route = createPage("about")
	.loader(async () => ({ items: [] }))
	.render(() => <div>About</div>)

export const other = "something"`;
		const matchEnd = source.indexOf('("about")') + '("about")'.length;
		const scope = extractChainScope(source, matchEnd);
		expect(scope).toContain(".loader");
		expect(scope).toContain(".render");
		expect(scope).not.toContain("other");
	});

	it("extracts scope to EOF when no next export", () => {
		const source = `export const route = createPage("home")
	.render(() => <div>Home</div>)`;
		const matchEnd = source.indexOf('("home")') + '("home")'.length;
		const scope = extractChainScope(source, matchEnd);
		expect(scope).toContain(".render");
	});
});

describe("detectChainMethods", () => {
	it("detects loader", () => {
		const result = detectChainMethods(".loader(async () => {})");
		expect(result.hasLoader).toBe(true);
		expect(result.hasHead).toBe(false);
	});

	it("detects multiple methods", () => {
		const chain = `
	.authenticate()
	.loader(async () => ({}))
	.head(() => ({ title: "X" }))
	.render(() => <div />)
	.errorRender(() => <div />)`;
		const result = detectChainMethods(chain);
		expect(result.hasLoader).toBe(true);
		expect(result.hasHead).toBe(true);
		expect(result.hasRender).toBe(true);
		expect(result.hasErrorRender).toBe(true);
	});

	it("detects all boundary methods", () => {
		const chain = `
	.errorRender(() => <div />)
	.notFoundRender(() => <div />)
	.unauthenticatedRender(() => <div />)
	.unauthorizedRender(() => <div />)`;
		const result = detectChainMethods(chain);
		expect(result.hasErrorRender).toBe(true);
		expect(result.hasNotFoundRender).toBe(true);
		expect(result.hasUnauthenticatedRender).toBe(true);
		expect(result.hasUnauthorizedRender).toBe(true);
	});

	it("detects effects, preloader, authorize", () => {
		const chain = `
	.authorize((ctx) => true)
	.effects(() => {})
	.preloader(async () => {})`;
		const result = detectChainMethods(chain);
		expect(result.hasAuthorize).toBe(true);
		expect(result.hasEffects).toBe(true);
		expect(result.hasPreloader).toBe(true);
	});

	it("detects response", () => {
		const result = detectChainMethods(".response(async () => new Response())");
		expect(result.hasResponse).toBe(true);
	});

	it("detects headers", () => {
		const result = detectChainMethods('.headers(() => ({ "X-Custom": "val" }))');
		expect(result.hasHeaders).toBe(true);
	});

	it("returns all false for empty chain", () => {
		const result = detectChainMethods("");
		expect(Object.values(result).every((v) => v === false)).toBe(true);
	});
});

describe("detectAllChains", () => {
	it("detects multiple chains in one file", () => {
		const source = `
export const route = createPage("about")
	.render(() => <div>About</div>)

export const other = createPage("contact")
	.loader(async () => ({}))
	.render(() => <div>Contact</div>)
`;
		const chains = detectAllChains(source);
		expect(chains).toHaveLength(2);
		expect(chains[0]?.virtualPath).toBe("about");
		expect(chains[0]?.chainMethods.hasRender).toBe(true);
		expect(chains[0]?.chainMethods.hasLoader).toBe(false);
		expect(chains[1]?.virtualPath).toBe("contact");
		expect(chains[1]?.chainMethods.hasLoader).toBe(true);
	});

	it("detects builder type", () => {
		const source = `export const route = createLayout("admin")
	.render((ctx) => <>{ctx.children}</>)`;
		const chains = detectAllChains(source);
		expect(chains[0]?.builderType).toBe("createLayout");
	});

	it("detects createRootLayout", () => {
		const source = `export const route = createRootLayout("_root_")
	.render((ctx) => <>{ctx.children}</>)`;
		const chains = detectAllChains(source);
		expect(chains[0]?.builderType).toBe("createRootLayout");
	});

	it("returns empty for no chains", () => {
		const chains = detectAllChains("const x = 1");
		expect(chains).toHaveLength(0);
	});

	it("handles generic type parameters", () => {
		const source = `export const route = createPage<{ id: string }>("products/[id]")
	.loader(async (ctx) => ({ item: null }))
	.render(() => <div />)`;
		const chains = detectAllChains(source);
		expect(chains).toHaveLength(1);
		expect(chains[0]?.virtualPath).toBe("products/[id]");
	});
});
