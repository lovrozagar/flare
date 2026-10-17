import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import type { SecurityConfig } from "../../src/server/security/apply.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// dx/server.md's SecurityConfig, CSP directives, Permissions-Policy, and response headers through the real
// `createServer(...).fetch` (B96): the policy a server and a route give, each key's `false`, and the headers finalize
// sets.

// Production, the headers a deployed app sends: dev drops HSTS and widens the CSP for Vite. A production root renders a
// whole document (B37).
beforeEach(() => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
})

afterEach(() => {
	vi.unstubAllEnvs()
})

const root = createRootLayout("_root_").render((props) =>
	createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children: props.children }),
			]
		},
	}),
)

// One page, `/p`, with the route's own security, under the server's.
function serve(server: SecurityConfig | undefined, route: SecurityConfig = {}) {
	const page = createPage("_root_/p")
		.security(() => route)
		.render(() => "p")
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] })
	return createServer({ router, ...(server !== undefined && { security: server }) })
}

async function headers(server: ReturnType<typeof serve>, url = "https://flare.test/p"): Promise<Headers> {
	return (await server.fetch(new Request(url))).headers
}

const directive = (policy: string | null, name: string) =>
	(policy ?? "").split("; ").find((part) => part === name || part.startsWith(`${name} `))

// Every directive at its default, and none of the named-only ones (dx/server.md CSP directives).
async function defaultsHold(): Promise<void> {
	const defaults = (await headers(serve(undefined))).get("content-security-policy")
	const nonce = /'nonce-([^']+)'/.exec(defaults ?? "")?.[1]
	const parts = [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self'",
		`style-src-elem 'self' 'nonce-${nonce}'`,
		"style-src-attr 'unsafe-inline'",
		"base-uri 'self'",
		"object-src 'none'",
		"img-src 'self' data: https:",
		"font-src 'self' data: https:",
		"connect-src 'self' https:",
		"worker-src 'self'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"upgrade-insecure-requests",
	]
	expect(parts.filter((part) => !(defaults?.split("; ").includes(part) ?? false))).toEqual([])
	for (const part of ["frame-src", "media-src", "block-all-mixed-content"])
		expect(directive(defaults, part)).toBeUndefined()
	expect(defaults?.split("; ")).toEqual(
		expect.arrayContaining([
			"default-src 'self'",
			"object-src 'none'",
			"frame-ancestors 'none'",
			"upgrade-insecure-requests",
		]),
	)
}

// Every directive at its default; one the server names replaces it, and a route's sources join the server's, its
// defaults included; a route over a server string adds to that string; the named-only directives appear once named
// (dx/server.md CSP directives, BUGS.md 330, 331).
it("csp directives", async () => {
	await defaultsHold()
	const named = (
		await headers(
			serve(
				{ "Content-Security-Policy": { "img-src": ["https://img.example"], "frame-src": ["https://video.example"] } },
				{
					"Content-Security-Policy": {
						"script-src": ["https://cdn.example"],
						"media-src": ["https://media.example"],
						"block-all-mixed-content": true,
					},
				},
			),
		)
	).get("content-security-policy")
	expect(directive(named, "img-src")).toBe("img-src https://img.example")
	expect(directive(named, "frame-src")).toBe("frame-src https://video.example")
	expect(directive(named, "media-src")).toBe("media-src https://media.example")
	expect(directive(named, "script-src")).toMatch(/^script-src 'self' https:\/\/cdn\.example 'nonce-[\da-f]+'$/)
	expect(directive(named, "block-all-mixed-content")).toBe("block-all-mixed-content")
	const http = (await headers(serve(undefined), "http://flare.test/p")).get("content-security-policy")
	expect(directive(http, "upgrade-insecure-requests")).toBeUndefined()
	const overString = (
		await headers(
			serve(
				{ "Content-Security-Policy": "default-src 'none'" },
				{ "Content-Security-Policy": { "img-src": ["https://i.example"] } },
			),
		)
	).get("content-security-policy")
	expect(overString).toBe("default-src 'none'; img-src https://i.example")
})

// Each plain key's default, its string, and its `false`; HSTS only over https; `X-Powered-By` only when set; a frame
// rule restated by `frame-ancestors` (dx/server.md SecurityConfig).
it("security keys", async () => {
	const keys = [
		"Strict-Transport-Security",
		"X-Content-Type-Options",
		"Referrer-Policy",
		"X-Frame-Options",
		"Cross-Origin-Opener-Policy",
		"Cross-Origin-Resource-Policy",
	] as const
	const plain = await headers(serve(undefined))
	expect(keys.map((key) => plain.get(key))).toEqual([
		"max-age=63072000; includeSubDomains",
		"nosniff",
		"strict-origin-when-cross-origin",
		"DENY",
		"same-origin",
		"same-origin",
	])
	expect((await headers(serve(undefined), "http://flare.test/p")).get("strict-transport-security")).toBeNull()
	const off = await headers(
		serve(Object.fromEntries(keys.map((key) => [key, false])) as SecurityConfig, {
			"Content-Security-Policy": false,
			"Permissions-Policy": false,
		}),
	)
	expect([...keys, "Content-Security-Policy", "Permissions-Policy"].map((key) => off.get(key))).toEqual(
		Array(8).fill(null),
	)
	const set = await headers(
		serve({ "X-Frame-Options": "SAMEORIGIN", "X-Powered-By": "Flare", "Referrer-Policy": "no-referrer" }),
	)
	expect([set.get("x-frame-options"), set.get("x-powered-by"), set.get("referrer-policy")]).toEqual([
		"SAMEORIGIN",
		"Flare",
		"no-referrer",
	])
	expect(directive(set.get("content-security-policy"), "frame-ancestors")).toBe("frame-ancestors 'self'")
	expect(plain.get("x-powered-by")).toBeNull()
})

// Permissions-Policy: every feature `false` by default, `"self"`, a list of origins, `true`, and the whole key as a
// string (dx/server.md Permissions-Policy).
it("permissions policy", async () => {
	const deny = (await headers(serve(undefined))).get("permissions-policy") ?? ""
	expect(deny.split(/,\s*/)).toEqual(
		[
			"accelerometer",
			"browsing-topics",
			"camera",
			"geolocation",
			"gyroscope",
			"interest-cohort",
			"magnetometer",
			"microphone",
			"payment",
			"usb",
		].map((feature) => `${feature}=()`),
	)
	const mixed = (
		await headers(serve({ "Permissions-Policy": { camera: "self", payment: ["https://pay.example"], usb: true } }))
	).get("permissions-policy")
	expect(mixed?.split(/,\s*/)).toEqual(
		expect.arrayContaining(["camera=(self)", 'payment=("https://pay.example")', "usb=*", "geolocation=()"]),
	)
	expect((await headers(serve({ "Permissions-Policy": "camera=()" }))).get("permissions-policy")).toBe("camera=()")
})

// Finalize sets `flare-build`, the server's `buildId`, on every answer, and `flare-render` by mode; `Allow` on an
// OPTIONS and a 405; no `Server-Timing` (dx/server.md Response headers).
it("response headers", async () => {
	const live = createPage("_root_/live").render(() => "live")
	const kept = createPage("_root_/kept")
		.cache({ isr: true })
		.render(() => "kept")
	const server = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [
				{ id: "_root_/live", path: "/live", module: live },
				{ id: "_root_/kept", path: "/kept", module: kept },
			],
		}),
		site: "https://flare.test",
		store: createMemoryStore(),
	})
	const at = (path: string, method = "GET") => server.fetch(new Request(`https://flare.test${path}`, { method }))
	const page = await at("/live")
	const stored = await at("/kept")
	const missing = await at("/nope")
	expect([page, stored, missing].map((response) => response.headers.get("flare-build"))).toEqual(
		Array(3).fill(server.buildId),
	)
	expect([page.headers.get("flare-render"), stored.headers.get("flare-render")]).toEqual(["ssr", "isr"])
	const options = await at("/live", "OPTIONS")
	const put = await at("/live", "PUT")
	expect([options.status, options.headers.get("allow"), put.status, put.headers.get("allow")]).toEqual([
		204,
		"GET, HEAD, OPTIONS",
		405,
		"GET, HEAD, OPTIONS",
	])
	expect([page, stored, options].some((response) => response.headers.has("server-timing"))).toBe(false)
})
