import { describe, expect, it } from "vitest";
import { createLayout, createPage, createRootLayout } from "../../../src/route-builder/index.ts";

/* ── createPage: .authenticateOptional() ──────────────────────────── */

describe("createPage — authenticateOptional", () => {
	it("sets authenticateMode to optional", () => {
		const result = createPage("_root_/about")
			.authenticateOptional()
			.render(() => null);
		expect(result.authenticateMode).toBe("optional");
	});

	it("sets authenticate to empty array with no args", () => {
		const result = createPage("_root_/about")
			.authenticateOptional()
			.render(() => null);
		expect(result.authenticate).toEqual([]);
	});

	it("passes callerData through", () => {
		const result = createPage("_root_/about")
			.authenticateOptional("viewer")
			.render(() => null);
		expect(result.authenticate).toEqual(["viewer"]);
		expect(result.authenticateMode).toBe("optional");
	});

	it("callerData with multiple args", () => {
		const result = createPage("_root_/about")
			.authenticateOptional("viewer", "editor")
			.render(() => null);
		expect(result.authenticate).toEqual(["viewer", "editor"]);
		expect(result.authenticateMode).toBe("optional");
	});

	it("full chain with authenticateOptional", () => {
		const result = createPage("_root_/dashboard")
			.cache({ client: { staleTime: 5000 } })
			.input({ params: (r: Record<string, string | string[]>) => r })
			.authenticateOptional()
			.preloader(() => ({ user: null }))
			.loader(() => ({ data: "x" }))
			.head(() => ({ title: "Dashboard" }))
			.headers(() => ({}))
			.render(() => null);

		expect(result.authenticateMode).toBe("optional");
		expect(result.authenticate).toEqual([]);
		expect(result._type).toBe("render");
		expect(result.cache).toEqual({ client: { staleTime: 5000 } });
		expect(result.preloader).toBeTypeOf("function");
		expect(result.loader).toBeTypeOf("function");
	});

	it("response variant with authenticateOptional", () => {
		const result = createPage("_root_/api/user")
			.authenticateOptional()
			.response(() => new Response("ok"));
		expect(result._type).toBe("response");
		expect(result.authenticateMode).toBe("optional");
		expect(result.authenticate).toEqual([]);
	});

	it("response variant with authenticateOptional + callerData", () => {
		const result = createPage("_root_/api/user")
			.authenticateOptional("api-key")
			.response(() => new Response("ok"));
		expect(result.authenticate).toEqual(["api-key"]);
		expect(result.authenticateMode).toBe("optional");
	});

	it("authorize works after authenticateOptional", () => {
		const authorizeFn = () => true;
		const result = createPage("_root_/x")
			.authenticateOptional()
			.authorize(authorizeFn)
			.render(() => null);
		expect(result.authorize).toBe(authorizeFn);
		expect(result.authenticateMode).toBe("optional");
	});

	it("effects works after authenticateOptional", () => {
		const depsFn = ({ search }: { search: Record<string, string> }) => [search.q];
		const result = createPage("_root_/search")
			.authenticateOptional()
			.effects({ loaderDeps: depsFn })
			.render(() => null);
		expect(result.effectsConfig?.loaderDeps).toBe(depsFn);
	});

	it("error boundaries after authenticateOptional render", () => {
		const result = createPage("_root_/x")
			.authenticateOptional()
			.render(() => null)
			.errorRender(() => null)
			.notFoundRender(() => null)
			.unauthorizedRender(() => null);
		const raw = result as unknown as Record<string, unknown>;
		expect(raw.errorRender).toBeTypeOf("function");
		expect(raw.notFoundRender).toBeTypeOf("function");
		expect(raw.unauthorizedRender).toBeTypeOf("function");
	});

	it("unauthenticatedRender after authenticateOptional render", () => {
		const result = createPage("_root_/x")
			.authenticateOptional()
			.render(() => null)
			.unauthenticatedRender(() => null);
		const raw = result as unknown as Record<string, unknown>;
		expect(raw.unauthenticatedRender).toBeTypeOf("function");
	});
});

/* ── createPage: .authenticate() still works ──────────────────────── */

describe("createPage — authenticate mode preserved", () => {
	it("sets authenticateMode to true (required)", () => {
		const result = createPage("_root_/x")
			.authenticate()
			.render(() => null);
		expect(result.authenticateMode).toBe(true);
	});

	it("authenticate with callerData sets mode true", () => {
		const result = createPage("_root_/x")
			.authenticate("admin")
			.render(() => null);
		expect(result.authenticateMode).toBe(true);
		expect(result.authenticate).toEqual(["admin"]);
	});

	it("no authenticate → authenticateMode undefined", () => {
		const result = createPage("_root_/x").render(() => null);
		expect(result.authenticateMode).toBeUndefined();
	});

	it("response route with authenticate sets mode true", () => {
		const result = createPage("_root_/api/x")
			.authenticate()
			.response(() => new Response("ok"));
		expect(result.authenticateMode).toBe(true);
	});

	it("response route without authenticate → authenticateMode undefined", () => {
		const result = createPage("_root_/api/x").response(() => new Response("ok"));
		expect(result.authenticateMode).toBeUndefined();
	});
});

/* ── createLayout: .authenticateOptional() ────────────────────────── */

describe("createLayout — authenticateOptional", () => {
	it("sets authenticateMode to optional", () => {
		const result = createLayout("_root_/(auth)")
			.authenticateOptional()
			.render(() => null);
		expect(result.authenticateMode).toBe("optional");
	});

	it("passes callerData", () => {
		const result = createLayout("_root_/(auth)")
			.authenticateOptional("session")
			.render(() => null);
		expect(result.authenticate).toEqual(["session"]);
		expect(result.authenticateMode).toBe("optional");
	});

	it("full chain with preloader + loader", () => {
		const result = createLayout("_root_/(auth)")
			.authenticateOptional()
			.preloader(() => ({ user: null }))
			.loader(() => ({ nav: [] }))
			.render(() => null);
		expect(result._type).toBe("layout");
		expect(result.authenticateMode).toBe("optional");
		expect(result.preloader).toBeTypeOf("function");
		expect(result.loader).toBeTypeOf("function");
	});

	it("authorize after authenticateOptional", () => {
		const authorizeFn = () => true;
		const result = createLayout("_root_/(auth)")
			.authenticateOptional()
			.authorize(authorizeFn)
			.render(() => null);
		expect(result.authorize).toBe(authorizeFn);
		expect(result.authenticateMode).toBe("optional");
	});

	it("error boundaries on layout with authenticateOptional", () => {
		const result = createLayout("_root_/(auth)")
			.authenticateOptional()
			.render(() => null)
			.errorRender(() => null)
			.unauthorizedRender(() => null);
		expect(result.errorRender).toBeTypeOf("function");
		expect(result.unauthorizedRender).toBeTypeOf("function");
	});
});

/* ── createLayout: .authenticate() mode ───────────────────────────── */

describe("createLayout — authenticate mode preserved", () => {
	it("sets authenticateMode to true", () => {
		const result = createLayout("_root_/(auth)")
			.authenticate()
			.render(() => null);
		expect(result.authenticateMode).toBe(true);
	});

	it("no authenticate → authenticateMode undefined", () => {
		const result = createLayout("_root_/(auth)").render(() => null);
		expect(result.authenticateMode).toBeUndefined();
	});
});

/* ── createRootLayout: .authenticateOptional() ────────────────────── */

describe("createRootLayout — authenticateOptional", () => {
	it("sets authenticateMode to optional", () => {
		const result = createRootLayout("_root_")
			.authenticateOptional()
			.render(() => null);
		expect(result.authenticateMode).toBe("optional");
	});

	it("passes callerData", () => {
		const result = createRootLayout("_root_")
			.authenticateOptional("token")
			.render(() => null);
		expect(result.authenticate).toEqual(["token"]);
		expect(result.authenticateMode).toBe("optional");
	});

	it("full chain with preloader + head", () => {
		const result = createRootLayout("_root_")
			.authenticateOptional()
			.preloader(() => ({ locale: "en" }))
			.loader(() => ({ theme: "dark" }))
			.head(() => ({ title: "App" }))
			.render(() => null);
		expect(result._type).toBe("root-layout");
		expect(result.authenticateMode).toBe("optional");
	});

	it("error boundaries on root layout with authenticateOptional", () => {
		const result = createRootLayout("_root_")
			.authenticateOptional()
			.render(() => null)
			.errorRender(() => null)
			.notFoundRender(() => null)
			.unauthorizedRender(() => null);
		expect(result.errorRender).toBeTypeOf("function");
		expect(result.notFoundRender).toBeTypeOf("function");
		expect(result.unauthorizedRender).toBeTypeOf("function");
	});
});

/* ── createRootLayout: .authenticate() mode ───────────────────────── */

describe("createRootLayout — authenticate mode preserved", () => {
	it("sets authenticateMode to true", () => {
		const result = createRootLayout("_root_")
			.authenticate()
			.render(() => null);
		expect(result.authenticateMode).toBe(true);
	});

	it("no authenticate → authenticateMode undefined", () => {
		const result = createRootLayout("_root_").render(() => null);
		expect(result.authenticateMode).toBeUndefined();
	});
});

/* ── cross-builder consistency ────────────────────────────────────── */

describe("cross-builder auth mode consistency", () => {
	it("all three builders produce authenticateMode: optional", () => {
		const page = createPage("_root_/x")
			.authenticateOptional()
			.render(() => null);
		const layout = createLayout("_root_/(x)")
			.authenticateOptional()
			.render(() => null);
		const root = createRootLayout("_root_")
			.authenticateOptional()
			.render(() => null);
		expect(page.authenticateMode).toBe("optional");
		expect(layout.authenticateMode).toBe("optional");
		expect(root.authenticateMode).toBe("optional");
	});

	it("all three builders produce authenticateMode: true", () => {
		const page = createPage("_root_/x")
			.authenticate()
			.render(() => null);
		const layout = createLayout("_root_/(x)")
			.authenticate()
			.render(() => null);
		const root = createRootLayout("_root_")
			.authenticate()
			.render(() => null);
		expect(page.authenticateMode).toBe(true);
		expect(layout.authenticateMode).toBe(true);
		expect(root.authenticateMode).toBe(true);
	});

	it("all three builders produce authenticateMode: undefined (none)", () => {
		const page = createPage("_root_/x").render(() => null);
		const layout = createLayout("_root_/(x)").render(() => null);
		const root = createRootLayout("_root_").render(() => null);
		expect(page.authenticateMode).toBeUndefined();
		expect(layout.authenticateMode).toBeUndefined();
		expect(root.authenticateMode).toBeUndefined();
	});

	it("callerData consistent across all builders", () => {
		const page = createPage("_root_/x")
			.authenticateOptional("a", "b")
			.render(() => null);
		const layout = createLayout("_root_/(x)")
			.authenticateOptional("a", "b")
			.render(() => null);
		const root = createRootLayout("_root_")
			.authenticateOptional("a", "b")
			.render(() => null);
		expect(page.authenticate).toEqual(["a", "b"]);
		expect(layout.authenticate).toEqual(["a", "b"]);
		expect(root.authenticate).toEqual(["a", "b"]);
	});
});
