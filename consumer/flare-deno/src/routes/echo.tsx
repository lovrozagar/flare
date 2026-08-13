import { createPage } from "flare/page"

export const route = createPage("_root_/echo")
	.loader((ctx) => {
		const headers = ctx.request.headers
		const url = new URL(ctx.request.url)
		const allHeaderNames = [...headers.keys()].sort()
		return {
			accept: headers.get("accept") ?? "none",
			acceptEncoding: headers.get("accept-encoding") ?? "none",
			acceptLanguage: headers.get("accept-language") ?? "none",
			connection: headers.get("connection") ?? "none",
			headerCount: allHeaderNames.length,
			headerNames: allHeaderNames.join(", "),
			host: headers.get("host") ?? "none",
			method: ctx.request.method,
			platform: "Deno",
			protocol: url.protocol,
			xCustom: headers.get("x-custom-test") ?? "not-set",
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="echo-heading">Echo — Deno</h1>
			<dl>
				<dt>Method</dt>
				<dd data-testid="echo-method">{props.loaderData.method}</dd>
				<dt>Host</dt>
				<dd data-testid="echo-host">{props.loaderData.host}</dd>
				<dt>Accept</dt>
				<dd data-testid="echo-accept">{props.loaderData.accept}</dd>
				<dt>Accept-Language</dt>
				<dd data-testid="echo-accept-lang">{props.loaderData.acceptLanguage}</dd>
				<dt>Accept-Encoding</dt>
				<dd data-testid="echo-accept-enc">{props.loaderData.acceptEncoding}</dd>
				<dt>Connection</dt>
				<dd data-testid="echo-connection">{props.loaderData.connection}</dd>
				<dt>Protocol</dt>
				<dd data-testid="echo-protocol">{props.loaderData.protocol}</dd>
				<dt>Header Count</dt>
				<dd data-testid="echo-header-count">{String(props.loaderData.headerCount)}</dd>
				<dt>X-Custom</dt>
				<dd data-testid="echo-custom">{props.loaderData.xCustom}</dd>
				<dt>Platform</dt>
				<dd data-testid="echo-platform">{props.loaderData.platform}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
