import { describe, expect, it } from "vitest";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute, matchRoute, matchRoutePartial } from "../../../src/router-primitives/index.ts";

function route(virtualPath: string, variablePath: string): RouteData {
	return {
		e: "default",
		o: {},
		p: () => Promise.resolve({ default: null }),
		t: "r",
		v: variablePath,
		x: virtualPath,
	};
}

describe("createTreeNode", () => {
	it("creates node with empty static map", () => {
		const node = createTreeNode();
		expect(node.s).toEqual({});
	});

	it("creates node with paramName", () => {
		const node = createTreeNode("id");
		expect(node.n).toBe("id");
	});
});

describe("insertRoute + matchRoute", () => {
	describe("static routes", () => {
		it("matches root", () => {
			const tree = createTreeNode();
			const r = route("_root_", "/");
			insertRoute(tree, "/", r);
			const result = matchRoute(tree, "/");
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({});
		});

		it("matches /about", () => {
			const tree = createTreeNode();
			const r = route("_root_/about", "/about");
			insertRoute(tree, "/about", r);
			expect(matchRoute(tree, "/about")?.route).toBe(r);
		});

		it("matches case-insensitively", () => {
			const tree = createTreeNode();
			const r = route("_root_/about", "/about");
			insertRoute(tree, "/about", r);
			expect(matchRoute(tree, "/About")?.route).toBe(r);
		});

		it("matches nested static", () => {
			const tree = createTreeNode();
			const r = route("_root_/products/details", "/products/details");
			insertRoute(tree, "/products/details", r);
			expect(matchRoute(tree, "/products/details")?.route).toBe(r);
		});
	});

	describe("params", () => {
		it("extracts single param", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/products/[id]", route("_root_/products/[id]", "/products/[id]"));
			const result = matchRoute(tree, "/products/123");
			expect(result?.params).toEqual({ id: "123" });
		});

		it("extracts multiple params", () => {
			const tree = createTreeNode();
			insertRoute(
				tree,
				"/products/[id]/reviews/[reviewId]",
				route("_root_/products/[id]/reviews/[reviewId]", "/products/[id]/reviews/[reviewId]"),
			);
			const result = matchRoute(tree, "/products/123/reviews/456");
			expect(result?.params).toEqual({ id: "123", reviewId: "456" });
		});

		it("preserves param case", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/users/[name]", route("_root_/users/[name]", "/users/[name]"));
			expect(matchRoute(tree, "/users/JohnDoe")?.params).toEqual({ name: "JohnDoe" });
		});
	});

	describe("catch-all", () => {
		it("captures as string[]", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[...slug]", route("_root_/docs/[...slug]", "/docs/[...slug]"));
			const result = matchRoute(tree, "/docs/a/b/c");
			expect(result?.params).toEqual({ slug: ["a", "b", "c"] });
		});
	});

	describe("optional catch-all", () => {
		it("matches with no segments", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[[...slug]]", route("_root_/docs/[[...slug]]", "/docs/[[...slug]]"));
			const result = matchRoute(tree, "/docs");
			expect(result?.params).toEqual({ slug: [] });
		});

		it("matches with segments", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[[...slug]]", route("_root_/docs/[[...slug]]", "/docs/[[...slug]]"));
			const result = matchRoute(tree, "/docs/a/b");
			expect(result?.params).toEqual({ slug: ["a", "b"] });
		});

		it("matches root with optional catch-all", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[...slug]]", route("_root_/[[...slug]]", "/[[...slug]]"));
			expect(matchRoute(tree, "/")?.params).toEqual({ slug: [] });
			expect(matchRoute(tree, "/a/b")?.params).toEqual({ slug: ["a", "b"] });
		});
	});

	describe("priority", () => {
		it("static over param", () => {
			const tree = createTreeNode();
			const staticRoute = route("_root_/products/details", "/products/details");
			const paramRoute = route("_root_/products/[id]", "/products/[id]");
			insertRoute(tree, "/products/details", staticRoute);
			insertRoute(tree, "/products/[id]", paramRoute);
			expect(matchRoute(tree, "/products/details")?.route).toBe(staticRoute);
			expect(matchRoute(tree, "/products/123")?.route).toBe(paramRoute);
		});
	});

	describe("no match", () => {
		it("returns null for nonexistent", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/about", route("_root_/about", "/about"));
			expect(matchRoute(tree, "/nonexistent")).toBeNull();
		});

		it("matches empty string as root", () => {
			const tree = createTreeNode();
			const r = route("_root_", "/");
			insertRoute(tree, "/", r);
			expect(matchRoute(tree, "")?.route).toBe(r);
		});
	});

	describe("duplicate insertion", () => {
		it("overwrites route data", () => {
			const tree = createTreeNode();
			const first = route("first", "/about");
			const second = route("second", "/about");
			insertRoute(tree, "/about", first);
			insertRoute(tree, "/about", second);
			expect(matchRoute(tree, "/about")?.route).toBe(second);
		});
	});

	describe("param decoding", () => {
		it("decodes percent-encoded single param", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/users/[name]", route("_root_/users/[name]", "/users/[name]"));
			const result = matchRoute(tree, "/users/caf%C3%A9");
			expect(result?.params).toEqual({ name: "café" });
		});

		it("decodes percent-encoded catch-all segments", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[...slug]", route("_root_/docs/[...slug]", "/docs/[...slug]"));
			const result = matchRoute(tree, "/docs/hello%20world/caf%C3%A9");
			expect(result?.params).toEqual({ slug: ["hello world", "café"] });
		});

		it("decodes percent-encoded optional catch-all", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[...slug]]", route("_root_/[[...slug]]", "/[[...slug]]"));
			const result = matchRoute(tree, "/a%20b/c%20d");
			expect(result?.params).toEqual({ slug: ["a b", "c d"] });
		});

		it("handles already-decoded ASCII params", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/products/[id]", route("_root_/products/[id]", "/products/[id]"));
			const result = matchRoute(tree, "/products/123");
			expect(result?.params).toEqual({ id: "123" });
		});
	});

	describe("prototype safety", () => {
		it("does not match Object.prototype properties", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/about", route("_root_/about", "/about"));
			expect(matchRoute(tree, "/constructor")).toBeNull();
			expect(matchRoute(tree, "/toString")).toBeNull();
			expect(matchRoute(tree, "/__proto__")).toBeNull();
			expect(matchRoute(tree, "/hasOwnProperty")).toBeNull();
		});

		it("matches route named constructor when explicitly registered", () => {
			const tree = createTreeNode();
			const r = route("_root_/constructor", "/constructor");
			insertRoute(tree, "/constructor", r);
			expect(matchRoute(tree, "/constructor")?.route).toBe(r);
		});
	});

	describe("edge cases", () => {
		it("normalizes multiple slashes", () => {
			const tree = createTreeNode();
			const r = route("_root_/about", "/about");
			insertRoute(tree, "/about", r);
			expect(matchRoute(tree, "///about///")?.route).toBe(r);
		});

		it("strips trailing slash", () => {
			const tree = createTreeNode();
			const r = route("_root_/about", "/about");
			insertRoute(tree, "/about", r);
			expect(matchRoute(tree, "/about/")?.route).toBe(r);
		});
	});

	describe("matchRoutePartial", () => {
		it("returns deepest matching prefix route", () => {
			const tree = createTreeNode();
			const root = route("_root_", "/");
			const products = route("_root_/products", "/products");
			insertRoute(tree, "/", root);
			insertRoute(tree, "/products", products);

			const result = matchRoutePartial(tree, "/products/nonexistent/deep");
			expect(result).not.toBeNull();
			expect(result?.route).toBe(products);
			expect(result?.params).toEqual({});
		});

		it("falls back to root when no intermediate matches", () => {
			const tree = createTreeNode();
			const root = route("_root_", "/");
			insertRoute(tree, "/", root);

			const result = matchRoutePartial(tree, "/totally/unknown/path");
			expect(result).not.toBeNull();
			expect(result?.route).toBe(root);
		});

		it("returns null when tree has no routes at all", () => {
			const tree = createTreeNode();
			const result = matchRoutePartial(tree, "/anything");
			expect(result).toBeNull();
		});

		it("works with parameterized prefix routes", () => {
			const tree = createTreeNode();
			const root = route("_root_", "/");
			const userPage = route("_root_/users/[id]", "/users/[id]");
			insertRoute(tree, "/", root);
			insertRoute(tree, "/users/[id]", userPage);

			const result = matchRoutePartial(tree, "/users/42/settings/nonexistent");
			expect(result).not.toBeNull();
			expect(result?.route).toBe(userPage);
			expect(result?.params).toEqual({ id: "42" });
		});

		it("prefers deeper match over shallower", () => {
			const tree = createTreeNode();
			const root = route("_root_", "/");
			const docs = route("_root_/docs", "/docs");
			const docsGuide = route("_root_/docs/guide", "/docs/guide");
			insertRoute(tree, "/", root);
			insertRoute(tree, "/docs", docs);
			insertRoute(tree, "/docs/guide", docsGuide);

			const result = matchRoutePartial(tree, "/docs/guide/chapter/1");
			expect(result).not.toBeNull();
			expect(result?.route).toBe(docsGuide);
		});

		it("returns null for root path with no root route", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/about", route("_root_/about", "/about"));
			const result = matchRoutePartial(tree, "/nonexistent");
			expect(result).toBeNull();
		});

		it("does not return exact match (only partial prefixes)", () => {
			const tree = createTreeNode();
			const about = route("_root_/about", "/about");
			insertRoute(tree, "/about", about);

			/* matchRoutePartial is for URLs that DON'T match — it tries shorter prefixes */
			const result = matchRoutePartial(tree, "/about");
			/* /about has 1 segment, loop starts at len-1=0, so only tries "/" */
			expect(result).toBeNull();
		});
	});

	describe("optional single param [[param]]", () => {
		it("matches when param is provided", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);
			const result = matchRoute(tree, "/fr");
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "fr" });
		});

		it("matches when param is skipped (root)", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);
			const result = matchRoute(tree, "/");
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({});
		});

		it("matches static children when param is skipped", () => {
			const tree = createTreeNode();
			const index = route("[[locale]]/_root_/", "/[[locale]]");
			const about = route("[[locale]]/_root_/about", "/[[locale]]/about");
			insertRoute(tree, "/[[locale]]", index);
			insertRoute(tree, "/[[locale]]/about", about);

			const result = matchRoute(tree, "/about");
			expect(result?.route).toBe(about);
			expect(result?.params).toEqual({});
		});

		it("matches static children when param is provided", () => {
			const tree = createTreeNode();
			const index = route("[[locale]]/_root_/", "/[[locale]]");
			const about = route("[[locale]]/_root_/about", "/[[locale]]/about");
			insertRoute(tree, "/[[locale]]", index);
			insertRoute(tree, "/[[locale]]/about", about);

			const result = matchRoute(tree, "/fr/about");
			expect(result?.route).toBe(about);
			expect(result?.params).toEqual({ locale: "fr" });
		});

		it("static wins over optional param consumption", () => {
			const tree = createTreeNode();
			const index = route("[[locale]]/_root_/", "/[[locale]]");
			const about = route("[[locale]]/_root_/about", "/[[locale]]/about");
			insertRoute(tree, "/[[locale]]", index);
			insertRoute(tree, "/[[locale]]/about", about);

			/* /about should match the static "about" child, not consume "about" as locale */
			const result = matchRoute(tree, "/about");
			expect(result?.route).toBe(about);
			expect(result?.params).toEqual({});
		});

		it("optional param in middle position", () => {
			const tree = createTreeNode();
			const r = route("shop/[[category]]/products", "/shop/[[category]]/products");
			insertRoute(tree, "/shop/[[category]]/products", r);

			/* with param */
			const withParam = matchRoute(tree, "/shop/electronics/products");
			expect(withParam?.route).toBe(r);
			expect(withParam?.params).toEqual({ category: "electronics" });

			/* without param — skip category */
			const withoutParam = matchRoute(tree, "/shop/products");
			expect(withoutParam?.route).toBe(r);
			expect(withoutParam?.params).toEqual({});
		});

		it("optional param at end", () => {
			const tree = createTreeNode();
			const r = route("users/[[tab]]", "/users/[[tab]]");
			insertRoute(tree, "/users/[[tab]]", r);

			expect(matchRoute(tree, "/users")?.params).toEqual({});
			expect(matchRoute(tree, "/users/settings")?.params).toEqual({ tab: "settings" });
		});

		it("multiple optional params at different levels", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/blog/[[page]]", "/[[locale]]/blog/[[page]]");
			insertRoute(tree, "/[[locale]]/blog/[[page]]", r);

			/* both provided */
			expect(matchRoute(tree, "/fr/blog/2")?.params).toEqual({ locale: "fr", page: "2" });
			/* only locale */
			expect(matchRoute(tree, "/fr/blog")?.params).toEqual({ locale: "fr" });
			/* only page (locale skipped) */
			expect(matchRoute(tree, "/blog/2")?.params).toEqual({ page: "2" });
			/* neither */
			expect(matchRoute(tree, "/blog")?.params).toEqual({});
		});

		it("optional param does not match when no descendant route exists", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]/about", route("about", "/[[locale]]/about"));
			/* /xyz has no matching descendant → null */
			expect(matchRoute(tree, "/xyz")).toBeNull();
		});

		it("decodes percent-encoded optional param", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("x", "/[[locale]]"));
			const result = matchRoute(tree, "/caf%C3%A9");
			expect(result?.params).toEqual({ locale: "café" });
		});

		it("returns null for malformed percent encoding in optional param", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("x", "/[[locale]]"));
			expect(matchRoute(tree, "/%ZZ")).toBeNull();
		});

		it("optional param with required param sibling", () => {
			const tree = createTreeNode();
			const optRoute = route("[[locale]]/", "/[[locale]]");
			const reqRoute = route("[id]/detail", "/[id]/detail");
			insertRoute(tree, "/[[locale]]", optRoute);
			insertRoute(tree, "/[id]/detail", reqRoute);

			/* /123/detail should match required param route */
			expect(matchRoute(tree, "/123/detail")?.route).toBe(reqRoute);
			expect(matchRoute(tree, "/123/detail")?.params).toEqual({ id: "123" });

			/* /fr should match optional param route (consume) */
			expect(matchRoute(tree, "/fr")?.route).toBe(optRoute);
			expect(matchRoute(tree, "/fr")?.params).toEqual({ locale: "fr" });
		});

		it("optional param does not greedily consume when static child exists deeper", () => {
			const tree = createTreeNode();
			const products = route("products", "/[[locale]]/products");
			const productDetail = route("products/[id]", "/[[locale]]/products/[id]");
			insertRoute(tree, "/[[locale]]/products", products);
			insertRoute(tree, "/[[locale]]/products/[id]", productDetail);

			/* /products — skip locale, match static "products" */
			expect(matchRoute(tree, "/products")?.route).toBe(products);
			expect(matchRoute(tree, "/products")?.params).toEqual({});

			/* /products/42 — skip locale, match products/[id] */
			expect(matchRoute(tree, "/products/42")?.route).toBe(productDetail);
			expect(matchRoute(tree, "/products/42")?.params).toEqual({ id: "42" });

			/* /fr/products — consume locale, match static "products" */
			expect(matchRoute(tree, "/fr/products")?.route).toBe(products);
			expect(matchRoute(tree, "/fr/products")?.params).toEqual({ locale: "fr" });

			/* /fr/products/42 — consume locale, match products/[id] */
			expect(matchRoute(tree, "/fr/products/42")?.route).toBe(productDetail);
			expect(matchRoute(tree, "/fr/products/42")?.params).toEqual({ id: "42", locale: "fr" });
		});
	});

	describe("malformed percent-encoding", () => {
		it("returns null for malformed single param (%ZZ)", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/users/[id]", route("_root_/users/[id]", "/users/[id]"));
			expect(matchRoute(tree, "/users/%ZZ")).toBeNull();
		});

		it("returns null for malformed catch-all segment", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[...slug]", route("_root_/docs/[...slug]", "/docs/[...slug]"));
			expect(matchRoute(tree, "/docs/ok/%ZZ/bad")).toBeNull();
		});

		it("returns null for malformed optional catch-all segment", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/a/[[...rest]]", route("_root_/a/[[...rest]]", "/a/[[...rest]]"));
			expect(matchRoute(tree, "/a/%ZZ")).toBeNull();
		});

		it("still matches static segments with malformed encoding", () => {
			const tree = createTreeNode();
			const r = route("_root_/about", "/about");
			insertRoute(tree, "/about", r);
			expect(matchRoute(tree, "/about")?.route).toBe(r);
		});

		it("returns null for truncated percent sequence (%E)", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/p/[id]", route("_root_/p/[id]", "/p/[id]"));
			expect(matchRoute(tree, "/p/%E")).toBeNull();
		});
	});
});
