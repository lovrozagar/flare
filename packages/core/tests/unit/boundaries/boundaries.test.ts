import { describe, expect, it } from "vitest";
import type { BoundaryRoute } from "../../../src/boundaries/index.ts";
import {
	findErrorBoundary,
	findNotFoundBoundary,
	findUnauthenticatedBoundary,
	findUnauthorizedBoundary,
} from "../../../src/boundaries/index.ts";

function makeRoute(overrides?: Partial<BoundaryRoute>): BoundaryRoute {
	return {
		virtualPath: "_root_",
		...overrides,
	};
}

describe("error boundary walk-up", () => {
	it("page errorRender catches page loader error", () => {
		const errorFn = () => "error UI";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ errorRender: errorFn, virtualPath: "_root_/page" }),
		];
		expect(findErrorBoundary(routes, 1)).toBe(errorFn);
	});

	it("layout errorRender catches child page error (if page has no errorRender)", () => {
		const layoutError = () => "layout error";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ errorRender: layoutError, virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		expect(findErrorBoundary(routes, 2)).toBe(layoutError);
	});

	it("root errorRender catches layout error (if layout has no errorRender)", () => {
		const rootError = () => "root error";
		const routes = [
			makeRoute({ errorRender: rootError, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/(auth)" }),
		];
		expect(findErrorBoundary(routes, 1)).toBe(rootError);
	});

	it("no boundary anywhere → returns null", () => {
		const routes = [makeRoute({ virtualPath: "_root_" }), makeRoute({ virtualPath: "_root_/page" })];
		expect(findErrorBoundary(routes, 1)).toBeNull();
	});

	it("global error boundary catches if no route boundary exists (tested via null)", () => {
		const routes = [makeRoute()];
		expect(findErrorBoundary(routes, 0)).toBeNull();
	});

	it("error at index 2 walks indices 1 → 0", () => {
		const rootError = () => "root";
		const routes = [
			makeRoute({ errorRender: rootError, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		/* page error, no page/layout boundary → finds root */
		expect(findErrorBoundary(routes, 2)).toBe(rootError);
	});

	it("skips errored route's own boundary for same-route errors", () => {
		/* errorRender on a route catches its OWN loader error */
		const pageError = () => "page error";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ errorRender: pageError, virtualPath: "_root_/page" }),
		];
		/* page's own errorRender catches its own error */
		expect(findErrorBoundary(routes, 1)).toBe(pageError);
	});
});

describe("notFound boundary walk-up", () => {
	it("layout notFoundRender catches NotFoundError from child page", () => {
		const layoutNotFound = () => "not found";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ notFoundRender: layoutNotFound, virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		/* page throws NotFoundError → caught by layout's notFoundRender */
		expect(findNotFoundBoundary(routes, 2)).toBe(layoutNotFound);
	});

	it("root notFoundRender catches if layout has no notFoundRender", () => {
		const rootNotFound = () => "root not found";
		const routes = [
			makeRoute({ notFoundRender: rootNotFound, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		expect(findNotFoundBoundary(routes, 2)).toBe(rootNotFound);
	});

	it("no notFound boundary → returns null", () => {
		const routes = [makeRoute({ virtualPath: "_root_" }), makeRoute({ virtualPath: "_root_/page" })];
		expect(findNotFoundBoundary(routes, 1)).toBeNull();
	});

	it("NotFoundError in root loader → null (global handles)", () => {
		const routes = [makeRoute({ virtualPath: "_root_" })];
		expect(findNotFoundBoundary(routes, 0)).toBeNull();
	});

	it("notFoundRender catches errors from child, not own route", () => {
		/* notFoundRender on a layout catches children's NotFoundError */
		const layoutNF = () => "layout NF";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ notFoundRender: layoutNF, virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/products/[id]" }),
		];
		/* child throws → parent's notFoundRender catches */
		expect(findNotFoundBoundary(routes, 2)).toBe(layoutNF);
	});
});

describe("unauthorized boundary walk-up", () => {
	it("page unauthorizedRender catches at page level", () => {
		const pageUnauth = () => "page unauth";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ unauthorizedRender: pageUnauth, virtualPath: "_root_/page" }),
		];
		expect(findUnauthorizedBoundary(routes, 1)).toBe(pageUnauth);
	});

	it("walk-up: page → layout → root", () => {
		const rootUnauth = () => "root unauth";
		const routes = [
			makeRoute({ unauthorizedRender: rootUnauth, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		expect(findUnauthorizedBoundary(routes, 2)).toBe(rootUnauth);
	});

	it("no unauthorized boundary → returns null", () => {
		const routes = [makeRoute(), makeRoute({ virtualPath: "_root_/page" })];
		expect(findUnauthorizedBoundary(routes, 1)).toBeNull();
	});

	it("UnauthenticatedError and UnauthorizedError use separate boundaries", () => {
		const unauthHandler = () => "login";
		const unauthzHandler = () => "denied";
		const routes = [
			makeRoute({
				unauthenticatedRender: unauthHandler,
				unauthorizedRender: unauthzHandler,
				virtualPath: "_root_",
			}),
			makeRoute({ virtualPath: "_root_/page" }),
		];
		expect(findUnauthenticatedBoundary(routes, 1)).toBe(unauthHandler);
		expect(findUnauthorizedBoundary(routes, 1)).toBe(unauthzHandler);
	});
});

describe("boundary resolution", () => {
	it("error at index 0 (root) with own errorRender → catches self", () => {
		const rootError = () => "root error";
		const routes = [makeRoute({ errorRender: rootError })];
		expect(findErrorBoundary(routes, 0)).toBe(rootError);
	});

	it("multiple boundaries → nearest wins", () => {
		const layoutError = () => "layout";
		const rootError = () => "root";
		const routes = [
			makeRoute({ errorRender: rootError }),
			makeRoute({ errorRender: layoutError, virtualPath: "_root_/(auth)" }),
			makeRoute({ virtualPath: "_root_/(auth)/page" }),
		];
		/* page error → layout boundary (nearer) */
		expect(findErrorBoundary(routes, 2)).toBe(layoutError);
	});

	it("single route → errorRender catches own errors", () => {
		const fn = () => "err";
		const routes = [makeRoute({ errorRender: fn })];
		expect(findErrorBoundary(routes, 0)).toBe(fn);
	});

	it("notFoundRender walks up from thrower (child), not self", () => {
		/* notFoundRender catches child's NotFoundError, walks UP from child */
		const layoutNF = () => "nf";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ notFoundRender: layoutNF, virtualPath: "_root_/(auth)" }),
		];
		/* if the layout itself throws NotFoundError, it walks up to root */
		expect(findNotFoundBoundary(routes, 1)).toBeNull();
		/* if a child of layout throws, layout catches */
	});
});
