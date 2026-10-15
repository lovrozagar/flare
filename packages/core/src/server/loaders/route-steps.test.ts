import { expect, it, vi } from "vitest"
import { runLoaders, type LoaderRoute, type RunInput } from "./run.ts"

const boom = new Error("boom")

function request(routes: readonly LoaderRoute[], extra: Partial<RunInput> = {}): RunInput {
	return {
		kind: "document",
		request: new Request("http://localhost/"),
		env: {},
		authenticate: () => null,
		routes,
		...extra,
	}
}

function throws(): never {
	throw boom
}

// `.headers()` merges root to page: a child key wins, `set-cookie` appends, and an undefined value keeps the parent's.
it("headers merge", async () => {
	const routes: LoaderRoute[] = [
		{ id: "_root_", headers: () => ({ "X-A": "root", "set-cookie": "r=1", "x-keep": "root" }) },
		{ id: "_root_/(g)", headers: () => ({ "x-a": "layout", "set-cookie": ["l=1", "l=2"] }) },
		{ id: "_root_/(g)/p", headers: () => ({ "x-keep": undefined, "Set-Cookie": "p=1" }) },
	]
	const run = await runLoaders(request(routes))
	expect(run.headers).toEqual({ "x-a": "layout", "set-cookie": ["r=1", "l=1", "l=2", "p=1"], "x-keep": "root" })
})

// A match whose loader threw writes no headers. A match whose loader resolved still does.
it("headers after throw", async () => {
	const layout = vi.fn<() => Record<string, string>>(() => ({ "x-layout": "1" }))
	const page = vi.fn<() => Record<string, string>>(() => ({ "x-page": "1" }))
	const run = await runLoaders(
		request([
			{ id: "_root_/(g)", loader: throws, headers: layout },
			{ id: "_root_/(g)/p", loader: () => ({ ok: true }), headers: page },
		]),
	)
	expect(layout).not.toHaveBeenCalled()
	expect(page).toHaveBeenCalledOnce()
	expect(run.headers).toEqual({ "x-page": "1" })
})

// A `.headers()` throw omits that match's headers and leaves the status (B82). It is a dev bug.
it("headers throw", async () => {
	const run = await runLoaders(
		request([
			{ id: "_root_", headers: () => ({ "x-root": "1" }) },
			{ id: "_root_/p", headers: throws },
		]),
	)
	expect(run.response.status).toBe(200)
	expect(run.headers).toEqual({ "x-root": "1" })
	expect(run.bugs).toContain(boom)
})

// Outside-in: a set key replaces, `false` removes a parent value, and a function gets the four fields, no nonce.
it("security merge", async () => {
	const seen: unknown[] = []
	const routes: LoaderRoute[] = [
		{ id: "_root_", security: { "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "default-src 'self'" } },
		{
			id: "_root_/(g)",
			loader: () => ({ section: "s" }),
			security: (ctx) => {
				seen.push(Object.keys(ctx).sort())
				return { "Content-Security-Policy": false }
			},
		},
		{ id: "_root_/(g)/p", security: { "X-Frame-Options": "DENY" } },
	]
	const run = await runLoaders(request(routes))
	expect(run.security).toEqual({ "X-Frame-Options": "DENY", "Content-Security-Policy": false })
	expect(seen).toEqual([["loaderData", "params", "preloaderContext", "search"]])
})

// An object `.security()` is static: the first failed match writes it, the stopped gate's included, and a function
// config at the failure waits for a loader that never resolved (BUGS.md B13).
it("first failure writes object security", async () => {
	const gated = await runLoaders(
		request([
			{ id: "_root_", auth: { mode: true, callerData: [] }, security: { "X-Frame-Options": "DENY" } },
			{ id: "_root_/p", security: { "Content-Security-Policy": false } },
		]),
	)
	expect(gated.security).toEqual({ "X-Frame-Options": "DENY" })
	const thrown = await runLoaders(
		request([
			{ id: "_root_", security: { "Content-Security-Policy": "default-src 'self'" } },
			{ id: "_root_/(g)", loader: throws, security: () => ({ "X-Frame-Options": "DENY" }) },
			{ id: "_root_/(g)/p", loader: throws, security: { "X-Frame-Options": false } },
		]),
	)
	expect(thrown.security).toEqual({ "Content-Security-Policy": "default-src 'self'" })
})
