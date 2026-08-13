import { createPage } from "flare/page"

export const route = createPage("_root_/server-context-test")
	.loader(({ serverContext }) => ({
		requestId: serverContext.requestId as string,
	}))
	.render((props) => (
		<div>
			<h1>Server Context Test</h1>
			<p data-testid="request-id">{props.loaderData.requestId}</p>
		</div>
	))
