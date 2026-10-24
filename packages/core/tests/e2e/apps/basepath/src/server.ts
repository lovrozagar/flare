import { createServer, type SecurityConfig } from "@lovrozagar/flare/server"
import { router } from "./router.ts"

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

export const server = createServer({
	router,
	security: ({ request, env }) => e2eWebKitCoop(request, env),
})
