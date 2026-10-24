import { createMemoryStore, createMiddleware, createServer, type SecurityConfig } from "@lovrozagar/flare/server"
import { serverFns } from "./_gen/server-fns.gen.ts"
import { router } from "./router.ts"
import { sessionOf } from "./session.ts"

// The e2e boot's capture check (dashboard.fixture.ts): one console line at this server's first request, which the
// boot must capture on every runtime, workerd's console included.
const probe = { logged: false }

const capture = createMiddleware(() => {
	if (probe.logged) return
	probe.logged = true
	console.error("[dashboard:probe] server up")
})

// Playwright's WebKit hangs about 1 in 1250 concurrent navigations to a document under COOP same-origin, a process swap
// it cancels (bugs.webkit.org 325840, BUGS.md 504.12). Only under FLARE_E2E_WEBKIT_NO_COOP=1, which Playwright's e2e
// runs set, does a WebKit request's answer go without COOP; real Safari under verify:safari, every other engine, and
// any deploy keep flare's default, which integration/ingress.test pins.
function e2eWebKitCoop(request: Request, env: unknown): SecurityConfig {
	const off =
		Reflect.get(Object(env), "FLARE_E2E_WEBKIT_NO_COOP") === "1" ||
		(typeof process !== "undefined" && process.env["FLARE_E2E_WEBKIT_NO_COOP"] === "1")
	const agent = request.headers.get("user-agent") ?? ""
	const webkit = /AppleWebKit\//.test(agent) && !/(Chrome|Chromium|Firefox)\//.test(agent)
	return off && webkit ? { "Cross-Origin-Opener-Policy": false } : {}
}

// The options the docs app leaves at their defaults take their other values here (B146): one memory store on every
// runtime, built once outside any request, and a document held until its defers settle.
export const server = createServer({
	router,
	serverFns,
	site: "https://dashboard.test",
	authenticate: ({ request, env }) => sessionOf(request, env),
	middleware: [capture],
	store: createMemoryStore(),
	documentResponseDefer: "buffer",
	security: ({ request, env }) => ({
		"Content-Security-Policy": { "frame-src": ["'none'"], "form-action": ["'self'"] },
		...e2eWebKitCoop(request, env),
	}),
	// The old home of the overview redirects to it, its query kept (dx/server.md rewrite).
	rewrite: (path) => (path === "/app/home" ? "/app/overview" : undefined),
})
