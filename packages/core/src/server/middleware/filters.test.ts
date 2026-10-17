import { expect, it } from "vitest"
import { enters, routePath } from "./filters.ts"

const page = (path: string) => ({ path, kind: "page" as const })

it("exact", () => {
	expect(enters({ exact: ["/about"] }, page("/about"))).toBe(true)
	expect(enters({ exact: ["/about"] }, page("/about/team"))).toBe(false)
	// A trailing slash serves the same page, so it is the same path to `exact`, either way round (BUGS.md 336).
	expect(enters({ exact: ["/admin"] }, page("/admin/"))).toBe(true)
	expect(enters({ exact: ["/admin/"] }, page("/admin"))).toBe(true)
	expect(enters({ exact: ["/"] }, page("/"))).toBe(true)
	expect(enters({ exact: ["/admin"] }, page("/admin//"))).toBe(false)
})

it("case", () => {
	expect(enters({ exact: ["/About"] }, page("/about"))).toBe(true)
	expect(enters({ prefix: ["/Admin"] }, page("/admin/users"))).toBe(true)
	// The path folds as well as the filter (plan 21 10.3).
	expect(enters({ prefix: ["/admin"] }, page("/ADMIN/x"))).toBe(true)
	expect(enters({ exact: ["/a"] }, page("/A"))).toBe(true)
})

it("prefix boundary", () => {
	expect(enters({ prefix: ["/admin"] }, page("/administrator"))).toBe(false)
})

it("prefix hit", () => {
	expect(enters({ prefix: ["/admin"] }, page("/admin/users"))).toBe(true)
	expect(enters({ prefix: ["/admin"] }, page("/admin"))).toBe(true)
	expect(enters({ prefix: ["/admin/"] }, page("/admin/users"))).toBe(true)
	// `exact` and `prefix` together match a path either one matches.
	expect(enters({ exact: ["/about"], prefix: ["/admin"] }, page("/about"))).toBe(true)
})

// A server-function filter names no `/_flare/fn` path, so it holds under any basePath.
it("kind", () => {
	expect(enters({ kind: ["serverFn"] }, { path: "/app/_flare/fn/abc", kind: "serverFn" })).toBe(true)
	expect(enters({ kind: ["serverFn"] }, page("/about"))).toBe(false)
	expect(enters({ kind: ["page"], prefix: ["/admin"] }, page("/admin"))).toBe(true)
	expect(enters({ kind: ["page"], prefix: ["/admin"] }, { path: "/admin", kind: "serverFn" })).toBe(false)
	// All omitted is every request.
	expect(enters({}, { path: "/x", kind: "serverFn" })).toBe(true)
})

// The route path drops the basePath, then a configured locale as the first segment, any case; another first segment,
// or a path outside the base, stays (BUGS.md 159).
it("route path", () => {
	const router = { basePath: "/base", locales: ["en", "hr"] }
	expect(routePath("/base/hr/admin", router)).toBe("/admin")
	expect(routePath("/base/HR", router)).toBe("/")
	expect(routePath("/base", router)).toBe("/")
	expect(routePath("/base/about", router)).toBe("/about")
	expect(routePath("/other/hr", router)).toBe("/other/hr")
	expect(routePath("/hr/x", { basePath: "/" })).toBe("/hr/x")
	expect(enters({ prefix: ["/admin"] }, { path: "/hr/admin", routePath: "/admin", kind: "page" })).toBe(true)
})
