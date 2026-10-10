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

const EN_LOCALE = { paramName: "locale", locales: ["en"] } as const;
const EN_DE_LOCALE = { paramName: "locale", locales: ["en", "de"] } as const;
const EMPTY_LOCALE = { paramName: "locale", locales: [] } as const;

describe("matchRoute — locale allow-list (localeMatch 4th arg)", () => {
	describe("required [locale] — same allow-list as optional", () => {
		it("/docs against [locale]-only tree → null", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[locale]", route("[locale]/_root_/", "/[locale]"));

			expect(matchRoute(tree, "/docs", false, EN_LOCALE)).toBeNull();
		});

		it("/does-not-exist-at-all against [locale] + /about tree → null", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/", route("_root_/", "/"));
			insertRoute(tree, "/about", route("_root_/about", "/about"));
			insertRoute(tree, "/[locale]", route("[locale]/_root_/", "/[locale]"));
			insertRoute(tree, "/[locale]/about", route("[locale]/_root_/about", "/[locale]/about"));

			expect(matchRoute(tree, "/does-not-exist-at-all", false, EN_LOCALE)).toBeNull();
			expect(matchRoute(tree, "/about", false, EN_LOCALE)?.route.v).toBe("/about");
		});

		it('/en against [locale]-only tree → match with params.locale="en"', () => {
			const tree = createTreeNode();
			const r = route("[locale]/_root_/", "/[locale]");
			insertRoute(tree, "/[locale]", r);

			const result = matchRoute(tree, "/en", false, EN_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "en" });
		});

		it("/en/about against [locale]/about → match", () => {
			const tree = createTreeNode();
			const r = route("[locale]/_root_/about", "/[locale]/about");
			insertRoute(tree, "/[locale]", route("[locale]/_root_/", "/[locale]"));
			insertRoute(tree, "/[locale]/about", r);

			const result = matchRoute(tree, "/en/about", false, EN_LOCALE);
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "en" });
		});

		it("/[id] is not constrained by locale allow-list", () => {
			const tree = createTreeNode();
			const r = route("_root_/users/[id]", "/users/[id]");
			insertRoute(tree, "/users/[id]", r);

			const result = matchRoute(tree, "/users/docs", false, EN_LOCALE);
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ id: "docs" });
		});

		it("/docs against [locale] without localeMatch → greedy match", () => {
			const tree = createTreeNode();
			const r = route("[locale]/_root_/", "/[locale]");
			insertRoute(tree, "/[locale]", r);

			const result = matchRoute(tree, "/docs");
			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ locale: "docs" });
		});
	});

	describe("consume rejected for non-locale segment", () => {
		it("/docs against [[locale]]-only tree → null (cross-worker segment rejected)", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));

			/* /docs would previously match with params.locale="docs" — now rejected */
			const result = matchRoute(tree, "/docs", false, EN_LOCALE);
			expect(result).toBeNull();
		});

		it("/app against [[locale]]-only tree → null", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));

			expect(matchRoute(tree, "/app", false, EN_LOCALE)).toBeNull();
		});

		it("/docs/solutions/revops against [[locale]]/solutions/revops tree → null", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(
				tree,
				"/[[locale]]/solutions/revops",
				route("[[locale]]/_root_/solutions/revops", "/[[locale]]/solutions/revops"),
			);

			/* The real bug: /docs/solutions/revops matched landing's [[locale]]/solutions/revops */
			expect(matchRoute(tree, "/docs/solutions/revops", false, EN_LOCALE)).toBeNull();
		});
	});

	describe("consume accepted for valid locale", () => {
		it('/en against [[locale]]-only tree → match with params.locale="en"', () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			const result = matchRoute(tree, "/en", false, EN_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "en" });
		});

		it('/de against [[locale]]-only tree with locales=["en","de"] → match with params.locale="de"', () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			const result = matchRoute(tree, "/de", false, EN_DE_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "de" });
		});

		it('/fr against tree with locales=["en","fr","de"] → match', () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			const result = matchRoute(tree, "/fr", false, {
				paramName: "locale",
				locales: ["en", "fr", "de"],
			});
			expect(result?.params).toEqual({ locale: "fr" });
		});
	});

	describe("skip branch still works (optional param skipped)", () => {
		it("/ against [[locale]] index → match via skip (locale absent from params)", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			const result = matchRoute(tree, "/", false, EN_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({});
		});

		it("/about against [[locale]]/about → match via skip with no locale param", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/about", "/[[locale]]/about");
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(tree, "/[[locale]]/about", r);

			const result = matchRoute(tree, "/about", false, EN_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({});
		});

		it('/en/about → match via consume + skip, locale="en"', () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/about", "/[[locale]]/about");
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(tree, "/[[locale]]/about", r);

			const result = matchRoute(tree, "/en/about", false, EN_LOCALE);
			expect(result?.route).toBe(r);
			expect(result?.params).toEqual({ locale: "en" });
		});
	});

	describe("static-vs-locale priority regression guard", () => {
		it("/foo/bar against tree with [[locale]]/bar AND /foo/bar → static /foo/bar wins", () => {
			const tree = createTreeNode();
			const localeBar = route("[[locale]]/_root_/bar", "/[[locale]]/bar");
			const staticFooBar = route("_root_/foo/bar", "/foo/bar");
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(tree, "/[[locale]]/bar", localeBar);
			insertRoute(tree, "/foo/bar", staticFooBar);

			const result = matchRoute(tree, "/foo/bar", false, EN_LOCALE);
			expect(result?.route).toBe(staticFooBar);
			expect(result?.params).toEqual({});
		});

		it("/en/bar → locale-consume path matches [[locale]]/bar", () => {
			const tree = createTreeNode();
			const localeBar = route("[[locale]]/_root_/bar", "/[[locale]]/bar");
			const staticFooBar = route("_root_/foo/bar", "/foo/bar");
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(tree, "/[[locale]]/bar", localeBar);
			insertRoute(tree, "/foo/bar", staticFooBar);

			const result = matchRoute(tree, "/en/bar", false, EN_LOCALE);
			expect(result?.route).toBe(localeBar);
			expect(result?.params).toEqual({ locale: "en" });
		});
	});

	describe("back-compat: no localeMatch arg → greedy behavior preserved", () => {
		it("/docs against [[locale]]-only tree → match (original greedy behavior)", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			/* No localeMatch → 4th arg absent → greedy original behavior */
			const result = matchRoute(tree, "/docs");
			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ locale: "docs" });
		});

		it("/any-string against [[locale]]-only tree → match without localeMatch", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			expect(matchRoute(tree, "/anything")?.params).toEqual({ locale: "anything" });
		});
	});

	describe("matchRoutePartial — locale constraint at every prefix", () => {
		it("partial /docs/x/y against [[locale]]/x/y tree → null (locale rejected at every prefix)", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			insertRoute(tree, "/[[locale]]/x", route("[[locale]]/_root_/x", "/[[locale]]/x"));
			insertRoute(tree, "/[[locale]]/x/y", route("[[locale]]/_root_/x/y", "/[[locale]]/x/y"));

			/* matchRoutePartial tries /docs/x, then /docs — both should be null with localeMatch */
			const result = matchRoutePartial(tree, "/docs/x/y", false, EN_LOCALE);
			expect(result).toBeNull();
		});

		it("partial /en/x/z against [[locale]]/x tree → match on /en/x prefix", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));
			const xRoute = route("[[locale]]/_root_/x", "/[[locale]]/x");
			insertRoute(tree, "/[[locale]]/x", xRoute);

			const result = matchRoutePartial(tree, "/en/x/z", false, EN_LOCALE);
			expect(result?.route).toBe(xRoute);
			expect(result?.params).toEqual({ locale: "en" });
		});
	});

	describe("edge cases", () => {
		it("locales=[] → rejects all consume; skip branch still matches /", () => {
			const tree = createTreeNode();
			const r = route("[[locale]]/_root_/", "/[[locale]]");
			insertRoute(tree, "/[[locale]]", r);

			/* / matches via skip (locale absent) */
			expect(matchRoute(tree, "/", false, EMPTY_LOCALE)).not.toBeNull();
			/* /anything rejected (no locale in allow-list) */
			expect(matchRoute(tree, "/anything", false, EMPTY_LOCALE)).toBeNull();
			expect(matchRoute(tree, "/en", false, EMPTY_LOCALE)).toBeNull();
		});

		it('paramName mismatch (config "locale" but route uses [[lang]]) → constraint silently does not apply', () => {
			const tree = createTreeNode();
			const r = route("[[lang]]/_root_/", "/[[lang]]");
			insertRoute(tree, "/[[lang]]", r);

			/* localeMatch.paramName="locale" but route param is "lang" → no constraint → greedy */
			const result = matchRoute(tree, "/docs", false, EN_LOCALE);
			expect(result).not.toBeNull();
			expect(result?.params).toEqual({ lang: "docs" });
		});

		it("paramName mismatch: valid locale still consumed as lang", () => {
			const tree = createTreeNode();
			const r = route("[[lang]]/_root_/", "/[[lang]]");
			insertRoute(tree, "/[[lang]]", r);

			/* constraint for "locale" param doesn't affect "lang" param */
			expect(matchRoute(tree, "/en", false, EN_LOCALE)?.params).toEqual({ lang: "en" });
		});

		it('case-sensitive: locale "EN" not in locales=["en"] → rejected', () => {
			const tree = createTreeNode();
			insertRoute(tree, "/[[locale]]", route("[[locale]]/_root_/", "/[[locale]]"));

			/* locales are case-sensitive — "EN" != "en" */
			expect(matchRoute(tree, "/EN", false, EN_LOCALE)).toBeNull();
		});
	});
});
