import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/context")
	.loader(({ serverContext }) => {
		const ctx = serverContext as { requestId: string; userAgent: string }
		return {
			hasUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				ctx.requestId,
			),
			requestId: ctx.requestId,
			uaPresent: ctx.userAgent.length > 0,
		}
	})
	.render((props) => (
		<main data-testid="context">
			<h1 data-testid="ctx-heading">Server context</h1>
			<dl>
				<dt>Request ID</dt>
				<dd data-testid="request-id">{props.loaderData.requestId}</dd>
				<dt>Has UUID</dt>
				<dd data-testid="ctx-has-uuid">{String(props.loaderData.hasUUID)}</dd>
				<dt>UA present</dt>
				<dd data-testid="ctx-ua-present">{String(props.loaderData.uaPresent)}</dd>
			</dl>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
