type SecurityCallback = (ctx: { request: Request }) => Record<string, unknown>

// Playwright's WebKit hangs about 1 in 1250 concurrent navigations to a document under COOP same-origin, a process swap
// it cancels (bugs.webkit.org 325840, BUGS.md 504.12). One server answers every engine, so a WebKit request's answer
// goes without COOP over the case's own security, and every other engine keeps flare's default, which
// ingress.test pins.
export function withWebKitCoop(server: Record<string, unknown> | undefined): SecurityCallback {
	const own: unknown = server?.["security"]
	return (ctx) => {
		const base = typeof own === "function" ? (own as SecurityCallback)(ctx) : (own ?? {})
		const agent = ctx.request.headers.get("user-agent") ?? ""
		const webkit = /AppleWebKit\//.test(agent) && !/(Chrome|Chromium|Firefox)\//.test(agent)
		return webkit ? { ...base, "Cross-Origin-Opener-Policy": false } : { ...base }
	}
}
