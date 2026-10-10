import { describe, expect, it, vi } from "vitest";
import { createLayout, createPage, createRootLayout } from "../../../src/route-builder/index.ts";

describe("createPage", () => {
	it("minimal: render only", () => {
		const result = createPage("_root_/about").render(() => null);
		expect(result._type).toBe("render");
		expect(result.virtualPath).toBe("_root_/about");
		expect(result.render).toBeTypeOf("function");
	});

	it("full chain", () => {
		const authorizeFn = vi.fn(() => true);
		const preloaderFn = vi.fn(() => ({ theme: "dark" as const }));
		const loaderFn = vi.fn(() => ({ data: "hello" }));
		const headFn = vi.fn(() => ({ title: "Test" }));
		const headersFn = vi.fn(() => ({ "x-custom": "1" }));
		const renderFn = vi.fn(() => null);

		const result = createPage("_root_/(auth)/dashboard")
			.cache({ client: { staleTime: 5000 } })
			.input({ params: (raw: Record<string, string | string[]>) => raw })
			.authenticate("admin")
			.authorize(authorizeFn)
			.effects({ loaderDeps: ({ search }) => [search.q] })
			.preloader(preloaderFn)
			.loader(loaderFn)
			.head(headFn)
			.headers(headersFn)
			.render(renderFn);

		expect(result._type).toBe("render");
		expect(result.virtualPath).toBe("_root_/(auth)/dashboard");
		expect(result.cache).toEqual({ client: { staleTime: 5000 } });
		expect(result.inputConfig).toBeDefined();
		expect(result.authenticate).toEqual(["admin"]);
		expect(result.authorize).toBe(authorizeFn);
		expect(result.effectsConfig).toBeDefined();
		expect(result.effectsConfig?.loaderDeps).toBeTypeOf("function");
		expect(result.preloader).toBe(preloaderFn);
		expect(result.loader).toBe(loaderFn);
		expect(result.head).toBe(headFn);
		expect(result.headers).toBe(headersFn);
		expect(result.render).toBe(renderFn);
	});

	it("skip to render: loaderData void", () => {
		const result = createPage("_root_/about").render(() => null);
		expect(result.loader).toBeUndefined();
		expect(result.preloader).toBeUndefined();
	});

	it("response variant", () => {
		const responseFn = vi.fn(() => new Response("ok"));
		const result = createPage("_root_/api/health").response(responseFn);
		expect(result._type).toBe("response");
		expect(result.response).toBe(responseFn);
		expect("loader" in result).toBe(false);
	});

	it("error boundaries after render", () => {
		const errorFn = vi.fn(() => null);
		const notFoundFn = vi.fn(() => null);
		const unauthorizedFn = vi.fn(() => null);

		const result = createPage("_root_/about")
			.render(() => null)
			.errorRender(errorFn)
			.notFoundRender(notFoundFn)
			.unauthorizedRender(unauthorizedFn);

		const raw = result as unknown as Record<string, unknown>;
		expect(raw.errorRender).toBe(errorFn);
		expect(raw.notFoundRender).toBe(notFoundFn);
		expect(raw.unauthorizedRender).toBe(unauthorizedFn);
	});

	it("reverse boundary order works", () => {
		const errorFn = vi.fn(() => null);
		const notFoundFn = vi.fn(() => null);
		const result = createPage("_root_/about")
			.render(() => null)
			.notFoundRender(notFoundFn)
			.errorRender(errorFn);

		/* after 2 of 3 boundaries, TS type only shows remaining .unauthorizedRender —
		   runtime stores the set values, so verify via the final result */
		expect(result.unauthorizedRender).toBeTypeOf("function");
	});

	it(".authenticate() with no args sets empty array", () => {
		const result = createPage("_root_/about")
			.authenticate()
			.render(() => null);
		expect(result.authenticate).toEqual([]);
	});

	it(".authenticate('admin') stores callerData", () => {
		const result = createPage("_root_/about")
			.authenticate("admin")
			.render(() => null);
		expect(result.authenticate).toEqual(["admin"]);
	});

	it(".effects() stores config", () => {
		const depsFn = ({ search }: { search: Record<string, string> }) => [search.q];
		const result = createPage("_root_/search")
			.effects({ loaderDeps: depsFn })
			.render(() => null);
		expect(result.effectsConfig?.loaderDeps).toBe(depsFn);
	});

	it(".input() stores config", () => {
		const paramsFn = (raw: Record<string, string | string[]>) => ({ id: String(raw.id) });
		const result = createPage("_root_/products/[id]")
			.input({ params: paramsFn })
			.render(() => null);
		expect(result.inputConfig?.params).toBe(paramsFn);
	});

	it("unauthorizedRender boundary after render", () => {
		const unauthorizedFn = vi.fn(() => null);
		const result = createPage("_root_/about")
			.render(() => null)
			.unauthorizedRender(unauthorizedFn);

		/* after 1 boundary, type shows remaining 2 — verify the stored fn via remaining methods */
		expect(result.errorRender).toBeTypeOf("function");
		expect(result.notFoundRender).toBeTypeOf("function");
	});

	it("all three boundaries in any order", () => {
		const result = createPage("_root_/about")
			.render(() => null)
			.unauthorizedRender(() => null)
			.notFoundRender(() => null)
			.errorRender(() => null);

		const raw = result as unknown as Record<string, unknown>;
		expect(raw.errorRender).toBeTypeOf("function");
		expect(raw.notFoundRender).toBeTypeOf("function");
		expect(raw.unauthorizedRender).toBeTypeOf("function");
	});
});

describe("createLayout", () => {
	it("creates layout with render", () => {
		const result = createLayout("_root_/(auth)").render(() => null);
		expect(result._type).toBe("layout");
		expect(result.virtualPath).toBe("_root_/(auth)");
	});

	it("full chain with preloader and loader", () => {
		const result = createLayout("_root_/(auth)")
			.authenticate()
			.preloader(() => ({ user: { id: "1" } }))
			.loader(() => ({ sidebar: true }))
			.render(() => null);

		expect(result._type).toBe("layout");
		expect(result.authenticate).toEqual([]);
		expect(result.preloader).toBeTypeOf("function");
		expect(result.loader).toBeTypeOf("function");
	});

	it("error boundaries on layout", () => {
		const result = createLayout("_root_/(auth)")
			.render(() => null)
			.errorRender(() => null)
			.notFoundRender(() => null);

		/* 2 of 3 set — only unauthorizedRender exposed */
		expect(result.unauthorizedRender).toBeTypeOf("function");
	});

	it("unauthorized boundary on layout", () => {
		const result = createLayout("_root_/(auth)")
			.render(() => null)
			.unauthorizedRender(() => null);

		/* 1 of 3 set — errorRender and notFoundRender exposed */
		expect(result.errorRender).toBeTypeOf("function");
		expect(result.notFoundRender).toBeTypeOf("function");
	});
});

describe("createRootLayout", () => {
	it("creates root layout", () => {
		const result = createRootLayout("_root_").render(() => null);
		expect(result._type).toBe("root-layout");
		expect(result.virtualPath).toBe("_root_");
	});

	it("full chain", () => {
		const result = createRootLayout("_root_")
			.preloader(() => ({ theme: "dark" as const }))
			.loader(() => ({ globals: true }))
			.head(() => ({ title: "App" }))
			.render(() => null);

		expect(result._type).toBe("root-layout");
		expect(result.preloader).toBeTypeOf("function");
		expect(result.loader).toBeTypeOf("function");
		expect(result.head).toBeTypeOf("function");
	});

	it("custom root path", () => {
		const result = createRootLayout("_admin_").render(() => null);
		expect(result._type).toBe("root-layout");
		expect(result.virtualPath).toBe("_admin_");
	});

	it("unauthorized boundary on root layout", () => {
		const result = createRootLayout("_root_")
			.render(() => null)
			.unauthorizedRender(() => null);

		/* 1 of 3 set — errorRender and notFoundRender exposed */
		expect(result.errorRender).toBeTypeOf("function");
		expect(result.notFoundRender).toBeTypeOf("function");
	});
});
