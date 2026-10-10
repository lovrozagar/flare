import { describe, expect, it } from "vitest";
import type { BoundaryRoute } from "../../../src/boundaries/index.ts";
import {
	findErrorBoundary,
	findNotFoundBoundary,
	findUnauthenticatedBoundary,
	findUnauthorizedBoundary,
} from "../../../src/boundaries/index.ts";

function makeRoute(overrides?: Partial<BoundaryRoute>): BoundaryRoute {
	return { virtualPath: "_root_", ...overrides };
}

/* ── empty routes array ────────────────────────────────────────────── */

describe("boundary with empty routes", () => {
	it("findErrorBoundary empty array index 0 → null", () => {
		expect(findErrorBoundary([], 0)).toBeNull();
	});

	it("findNotFoundBoundary empty array index 0 → null", () => {
		expect(findNotFoundBoundary([], 0)).toBeNull();
	});

	it("findUnauthenticatedBoundary empty array index 0 → null", () => {
		expect(findUnauthenticatedBoundary([], 0)).toBeNull();
	});

	it("findUnauthorizedBoundary empty array index 0 → null", () => {
		expect(findUnauthorizedBoundary([], 0)).toBeNull();
	});
});

/* ── out-of-bounds index ───────────────────────────────────────────── */

describe("boundary with out-of-bounds index", () => {
	const routes = [makeRoute({ errorRender: () => "err", virtualPath: "_root_" })];

	it("findErrorBoundary index beyond array → walks back to find boundary", () => {
		/* index 5 in array of length 1: loop starts at 5, routes[5] is undefined, skips, walks down to 0 */
		expect(findErrorBoundary(routes, 5)).not.toBeNull();
	});

	it("findNotFoundBoundary index beyond array → walks from index-1", () => {
		const withNf = [makeRoute({ notFoundRender: () => "nf" })];
		expect(findNotFoundBoundary(withNf, 5)).not.toBeNull();
	});

	it("negative index → null (loop doesn't start)", () => {
		expect(findErrorBoundary(routes, -1)).toBeNull();
	});
});

/* ── notFound asymmetric semantics ─────────────────────────────────── */

describe("notFound asymmetric vs error symmetric", () => {
	it("errorRender catches own route error (symmetric)", () => {
		const fn = () => "my error";
		const routes = [makeRoute({ errorRender: fn, virtualPath: "_root_/page" })];
		expect(findErrorBoundary(routes, 0)).toBe(fn);
	});

	it("notFoundRender does NOT catch own route error (asymmetric)", () => {
		const fn = () => "my nf";
		const routes = [makeRoute({ notFoundRender: fn, virtualPath: "_root_/page" })];
		/* starts at throwRouteIndex - 1 = -1, loop doesn't run */
		expect(findNotFoundBoundary(routes, 0)).toBeNull();
	});

	it("notFoundRender at index 1 catches child at index 2", () => {
		const fn = () => "nf";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ notFoundRender: fn, virtualPath: "_root_/(layout)" }),
			makeRoute({ virtualPath: "_root_/(layout)/page" }),
		];
		expect(findNotFoundBoundary(routes, 2)).toBe(fn);
	});

	it("notFoundRender at index 1, error at index 1 → null (can't catch own)", () => {
		const fn = () => "nf";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ notFoundRender: fn, virtualPath: "_root_/(layout)" }),
		];
		expect(findNotFoundBoundary(routes, 1)).toBeNull();
	});
});

/* ── unauthenticated boundary semantics (like error: catches own) ──── */

describe("unauthenticated boundary catches own route", () => {
	it("unauthenticatedRender at error route → catches self", () => {
		const fn = () => "login";
		const routes = [makeRoute({ unauthenticatedRender: fn })];
		expect(findUnauthenticatedBoundary(routes, 0)).toBe(fn);
	});

	it("walk-up across 4 routes", () => {
		const fn = () => "login";
		const routes = [
			makeRoute({ unauthenticatedRender: fn, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/a" }),
			makeRoute({ virtualPath: "_root_/a/b" }),
			makeRoute({ virtualPath: "_root_/a/b/c" }),
		];
		expect(findUnauthenticatedBoundary(routes, 3)).toBe(fn);
	});
});

/* ── unauthorized boundary ─────────────────────────────────────────── */

describe("unauthorized boundary walk-up", () => {
	it("unauthorizedRender at error route → catches self", () => {
		const fn = () => "denied";
		const routes = [makeRoute({ unauthorizedRender: fn })];
		expect(findUnauthorizedBoundary(routes, 0)).toBe(fn);
	});

	it("nearest boundary wins in deep hierarchy", () => {
		const rootFn = () => "root denied";
		const layoutFn = () => "layout denied";
		const routes = [
			makeRoute({ unauthorizedRender: rootFn, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/a" }),
			makeRoute({ unauthorizedRender: layoutFn, virtualPath: "_root_/a/b" }),
			makeRoute({ virtualPath: "_root_/a/b/c" }),
		];
		expect(findUnauthorizedBoundary(routes, 3)).toBe(layoutFn);
	});
});

/* ── multiple boundary types on same route ─────────────────────────── */

describe("multiple boundary types on same route", () => {
	it("all four boundary types on root route", () => {
		const errFn = () => "err";
		const nfFn = () => "nf";
		const unauthFn = () => "unauth";
		const unauthzFn = () => "unauthz";
		const routes = [
			makeRoute({
				errorRender: errFn,
				notFoundRender: nfFn,
				unauthenticatedRender: unauthFn,
				unauthorizedRender: unauthzFn,
			}),
			makeRoute({ virtualPath: "_root_/page" }),
		];

		expect(findErrorBoundary(routes, 1)).toBe(errFn);
		expect(findNotFoundBoundary(routes, 1)).toBe(nfFn);
		expect(findUnauthenticatedBoundary(routes, 1)).toBe(unauthFn);
		expect(findUnauthorizedBoundary(routes, 1)).toBe(unauthzFn);
	});
});

/* ── sparse-like routes (undefined slots) ──────────────────────────── */

describe("routes with undefined entries", () => {
	it("undefined route entry skipped in walk-up", () => {
		const fn = () => "err";
		const routes: Array<BoundaryRoute | undefined> = [
			makeRoute({ errorRender: fn }),
			undefined,
			makeRoute({ virtualPath: "_root_/page" }),
		];
		/* route[1] is undefined → route?.errorRender is undefined → skipped */
		expect(findErrorBoundary(routes as BoundaryRoute[], 2)).toBe(fn);
	});
});

/* ── deep hierarchy (5+ routes) ────────────────────────────────────── */

describe("deep hierarchy boundary resolution", () => {
	it("5-level deep: boundary at root catches leaf error", () => {
		const fn = () => "root err";
		const routes = [
			makeRoute({ errorRender: fn, virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/a" }),
			makeRoute({ virtualPath: "_root_/a/b" }),
			makeRoute({ virtualPath: "_root_/a/b/c" }),
			makeRoute({ virtualPath: "_root_/a/b/c/d" }),
		];
		expect(findErrorBoundary(routes, 4)).toBe(fn);
	});

	it("5-level deep: boundary at middle catches descendant", () => {
		const fn = () => "mid err";
		const routes = [
			makeRoute({ virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/a" }),
			makeRoute({ errorRender: fn, virtualPath: "_root_/a/b" }),
			makeRoute({ virtualPath: "_root_/a/b/c" }),
			makeRoute({ virtualPath: "_root_/a/b/c/d" }),
		];
		expect(findErrorBoundary(routes, 4)).toBe(fn);
	});
});
