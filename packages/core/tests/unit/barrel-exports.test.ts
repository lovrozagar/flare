import { describe, expect, it } from "vitest";
import * as buildLocationMod from "../../src/build-location.ts";
import * as createClientOnlyFnMod from "../../src/create-client-only-fn.ts";
import * as createIsomorphicFnMod from "../../src/create-isomorphic-fn.ts";
import * as createLayoutMod from "../../src/create-layout.ts";
import * as createPageMod from "../../src/create-page.ts";
import * as createRootLayoutMod from "../../src/create-root-layout.ts";
import * as createRouterMod from "../../src/create-router.ts";
import * as createServerOnlyFnMod from "../../src/create-server-only-fn.ts";
import * as directionMod from "../../src/direction.ts";
import * as errorsMod from "../../src/errors/index.ts";
import * as interceptOutletMod from "../../src/intercept-outlet.ts";
import * as internalMod from "../../src/internal.ts";
import * as navigateMod from "../../src/navigate.ts";
import * as navigationProgressMod from "../../src/navigation-progress.ts";
import * as resetCssMod from "../../src/reset-css.ts";
import * as serverFnQueryMod from "../../src/server-fn-query.ts";
import * as themeMod from "../../src/theme.ts";
import * as urlMod from "../../src/url/index.ts";
import * as viewTransitionCssMod from "../../src/view-transition-css.ts";

function assertExports(mod: Record<string, unknown>, expected: string[]) {
	const sorted = [...expected].sort();
	for (const name of sorted) {
		it(`exports ${name}`, () => {
			expect(mod[name]).toBeDefined();
		});
	}
	it("no unexpected runtime exports", () => {
		expect(Object.keys(mod).sort()).toEqual(sorted);
	});
}

describe("barrel exports — create-page", () => {
	assertExports(createPageMod as unknown as Record<string, unknown>, ["createPage"]);
});

describe("barrel exports — create-layout", () => {
	assertExports(createLayoutMod as unknown as Record<string, unknown>, ["createLayout"]);
});

describe("barrel exports — create-root-layout", () => {
	assertExports(createRootLayoutMod as unknown as Record<string, unknown>, ["createRootLayout"]);
});

describe("barrel exports — create-router", () => {
	assertExports(createRouterMod as unknown as Record<string, unknown>, ["createRouter"]);
});

describe("barrel exports — errors", () => {
	assertExports(errorsMod as unknown as Record<string, unknown>, [
		"NavigationError",
		"NotFoundError",
		"RedirectResponse",
		"ServerFnValidationError",
		"UnauthenticatedError",
		"UnauthorizedError",
		"isNavigationError",
		"isNotFoundError",
		"isRedirectResponse",
		"isServerFnValidationError",
		"isUnauthenticatedError",
		"isUnauthorizedError",
		"notFound",
		"redirect",
		"unauthenticated",
		"unauthorized",
	]);
});

describe("barrel exports — reset-css", () => {
	assertExports(resetCssMod as unknown as Record<string, unknown>, ["ResetCSS"]);
});

describe("barrel exports — view-transition-css", () => {
	assertExports(viewTransitionCssMod as unknown as Record<string, unknown>, ["ViewTransitionCSS"]);
});

describe("barrel exports — navigate", () => {
	assertExports(navigateMod as unknown as Record<string, unknown>, ["navigate", "prefetch"]);
});

describe("barrel exports — navigation-progress", () => {
	assertExports(navigationProgressMod as unknown as Record<string, unknown>, ["NavigationProgress"]);
});

describe("barrel exports — build-location", () => {
	assertExports(buildLocationMod as unknown as Record<string, unknown>, ["buildLocation"]);
});

describe("barrel exports — direction", () => {
	assertExports(directionMod as unknown as Record<string, unknown>, [
		"DirectionProvider",
		"DirectionScript",
		"getDirFromLocale",
		"getDirectionScript",
		"useDirection",
	]);
});

describe("barrel exports — theme", () => {
	assertExports(themeMod as unknown as Record<string, unknown>, [
		"ThemeProvider",
		"ThemeScript",
		"escapeJsString",
		"getThemeScript",
		"useTheme",
	]);
});

describe("barrel exports — server-fn-query", () => {
	assertExports(serverFnQueryMod as unknown as Record<string, unknown>, [
		"serverFnMutationOptions",
		"serverFnQueryOptions",
	]);
});

describe("barrel exports — url", () => {
	assertExports(urlMod as unknown as Record<string, unknown>, [
		"buildUrl",
		"parseSearchParams",
		"resolvePathParams",
		"sameOriginRedirectPath",
		"serializeSearchParams",
	]);
});

describe("barrel exports — create-server-only-fn", () => {
	assertExports(createServerOnlyFnMod as unknown as Record<string, unknown>, ["createServerOnlyFn"]);
});

describe("barrel exports — create-client-only-fn", () => {
	assertExports(createClientOnlyFnMod as unknown as Record<string, unknown>, ["createClientOnlyFn"]);
});

describe("barrel exports — create-isomorphic-fn", () => {
	assertExports(createIsomorphicFnMod as unknown as Record<string, unknown>, ["createIsomorphicFn"]);
});

describe("barrel exports — internal", () => {
	it("exports preload", () => {
		expect((internalMod as unknown as Record<string, unknown>).preload).toBeDefined();
	});
	it("exports isRenderFn", () => {
		expect((internalMod as unknown as Record<string, unknown>).isRenderFn).toBeDefined();
	});
	it("exports mergeHeadConfigs", () => {
		expect((internalMod as unknown as Record<string, unknown>).mergeHeadConfigs).toBeDefined();
	});
});

describe("barrel exports — intercept-outlet", () => {
	assertExports(interceptOutletMod as unknown as Record<string, unknown>, ["InterceptOutlet"]);
});
