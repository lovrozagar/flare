import { createPage } from "flare/page"

export const route = createPage("_root_/")
	.loader(({ request, serverContext }) => {
		const ua = request.headers.get("user-agent") ?? "unknown"
		const acceptLang = request.headers.get("accept-language") ?? "none"
		const ctx = serverContext as { requestId: string; userAgent: string }
		const visitToken = `visit-${Date.now()}`
		return {
			acceptLanguage: acceptLang,
			name: "Node",
			requestId: ctx.requestId,
			timestamp: Date.now(),
			userAgent: ua,
			visitToken,
		}
	})
	.head(({ loaderData }) => ({
		title: `Flare on Node — ${(loaderData as { requestId: string }).requestId.slice(0, 8)}`,
	}))
	.headers(({ loaderData }) => ({
		"set-cookie": `flare-visit=${(loaderData as { visitToken: string }).visitToken}; Path=/; SameSite=Lax`,
		"x-deploy-target": "Node",
		"x-powered-by": "flare",
	}))
	.render((props) => (
		<div>
			<h1>Hello from Flare on Node</h1>
			<nav>
				<a href="/about">About</a>
				<a href="/deferred">Deferred</a>
				<a href="/old-page">Old Page</a>
				<a href="/error-test">Error Test</a>
				<a href="/search?q=hello&page=2">Search</a>
				<a href="/users/42">User 42</a>
				<a href="/dashboard">Dashboard</a>
				<a href="/hash?input=test">Hash</a>
				<a href="/encoding">Encoding</a>
				<a href="/files/docs/readme.md">Files</a>
				<a href="/json-edge">JSON Edge</a>
				<a href="/seo?title=Hello">SEO</a>
				<a href="/preloaded">Preloaded</a>
				<a href="/echo">Echo</a>
				<a href="/decode/hello%20world">Decode</a>
				<a href="/context">Context</a>
				<a href="/multi-cookie">Multi Cookie</a>
				<a href="/time">Time</a>
				<a href="/streams">Streams</a>
			</nav>
			<dl>
				<dt>Request ID</dt>
				<dd data-testid="request-id">{props.loaderData.requestId}</dd>
				<dt>User Agent</dt>
				<dd data-testid="user-agent">{props.loaderData.userAgent}</dd>
				<dt>Accept-Language</dt>
				<dd data-testid="accept-lang">{props.loaderData.acceptLanguage}</dd>
				<dt>Timestamp</dt>
				<dd data-testid="timestamp">{String(props.loaderData.timestamp)}</dd>
				<dt>Visit Token</dt>
				<dd data-testid="visit-token">{props.loaderData.visitToken}</dd>
			</dl>
		</div>
	))
