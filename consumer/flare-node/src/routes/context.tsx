import { createPage } from "flare/page"

export const route = createPage("_root_/context")
	.loader(({ serverContext }) => {
		const ctx = serverContext as {
			isoTimestamp: string
			origin: string
			pathname: string
			requestId: string
			timestamp: number
			userAgent: string
		}
		return {
			hasUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ctx.requestId),
			isoTimestamp: ctx.isoTimestamp,
			origin: ctx.origin,
			pathname: ctx.pathname,
			platform: "Node",
			requestId: ctx.requestId,
			timestamp: ctx.timestamp,
			uaPresent: ctx.userAgent.length > 0,
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="ctx-heading">Context — Node</h1>
			<dl>
				<dt>Request ID</dt>
				<dd data-testid="ctx-request-id">{props.loaderData.requestId}</dd>
				<dt>Has UUID</dt>
				<dd data-testid="ctx-has-uuid">{String(props.loaderData.hasUUID)}</dd>
				<dt>ISO Timestamp</dt>
				<dd data-testid="ctx-iso">{props.loaderData.isoTimestamp}</dd>
				<dt>Origin</dt>
				<dd data-testid="ctx-origin">{props.loaderData.origin}</dd>
				<dt>Pathname</dt>
				<dd data-testid="ctx-pathname">{props.loaderData.pathname}</dd>
				<dt>Timestamp</dt>
				<dd data-testid="ctx-timestamp">{String(props.loaderData.timestamp)}</dd>
				<dt>UA Present</dt>
				<dd data-testid="ctx-ua-present">{String(props.loaderData.uaPresent)}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
