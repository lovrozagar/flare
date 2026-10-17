import { expect, it } from "vitest"
import { RedirectError } from "../../shared/errors/redirect.ts"
import { canonicalRedirect, redirectLocation } from "./builder.ts"

it("GET canonical", () => {
	expect(canonicalRedirect({ method: "GET", path: "/a//b" })).toEqual({
		status: 301,
		location: "/a/b",
		method: "GET",
	})
	expect(canonicalRedirect({ method: "HEAD", path: "/a//b" }).status).toBe(301)
})

it("POST canonical", () => {
	expect(canonicalRedirect({ method: "POST", path: "/a//b" })).toEqual({
		status: 308,
		location: "/a/b",
		method: "POST",
	})
})

it("hostile is 400", () => {
	const result = canonicalRedirect({ method: "GET", path: "//evil" })
	expect(result.status).toBe(400)
	expect(result).not.toHaveProperty("location")
})

it("always", () => {
	expect(canonicalRedirect({ method: "GET", path: "/about", trailingSlash: "always" })).toEqual({
		status: 301,
		location: "/about/",
		method: "GET",
	})
	expect(canonicalRedirect({ method: "GET", path: "/about/", trailingSlash: "always" })).toEqual({
		status: 200,
		path: "/about/",
	})
})

it("preserve both", () => {
	expect(canonicalRedirect({ method: "GET", path: "/about", trailingSlash: "preserve" })).toEqual({
		status: 200,
		path: "/about",
	})
	expect(canonicalRedirect({ method: "GET", path: "/about/", trailingSlash: "preserve" })).toEqual({
		status: 200,
		path: "/about/",
	})
})

it("no double slash", () => {
	expect(canonicalRedirect({ method: "GET", path: "/", trailingSlash: "always" })).toEqual({
		status: 200,
		path: "/",
	})
	const folded = canonicalRedirect({ method: "GET", path: "/a//b", trailingSlash: "always" })
	expect(folded).toEqual({ status: 301, location: "/a/b/", method: "GET" })
	expect(folded).not.toEqual(expect.objectContaining({ location: "//" }))
})

// A redirect() as a loader throws it.
function thrown(target: { to?: string; href?: string; search?: object }): RedirectError {
	return new RedirectError({ ...target, status: 303, replace: false })
}

// A thrown redirect() to a route id is the route's URL as the router writes it: under the base, the index the base
// itself, then the trailing-slash rule, so it never meets a second redirect. An `href` is used as written (BUGS.md 188).
it("redirect location", () => {
	const always = { basePath: "/app", trailingSlash: "always" } as const
	expect(redirectLocation(thrown({ to: "_root_/about" }), always)).toBe("/app/about/")
	expect(redirectLocation(thrown({ to: "_root_/", search: { q: 1 } }), { ...always, trailingSlash: "preserve" })).toBe(
		"/app?q=1",
	)
	expect(redirectLocation(thrown({ href: "/x" }), always)).toBe("/x")
})
