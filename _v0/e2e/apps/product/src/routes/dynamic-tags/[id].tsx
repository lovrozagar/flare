import { createPage } from "@lovrozagar/flare/page";

let callCount = 0;

export const route = createPage("_root_/dynamic-tags/[id]")
	.cache({
		ssr: {
			staleTime: 5_000,
			tags: ({ params }) => ["dtag", `dtag:${params.id}`],
			ttl: 60,
		},
	})
	.loader(({ location }) => {
		callCount++;
		return { callCount, id: location.params.id, timestamp: Date.now() };
	})
	.render((props) => (
		<div data-testid="dynamic-tags">
			<p data-testid="dtag-id">{props.loaderData.id}</p>
			<p data-testid="dtag-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="dtag-calls">{props.loaderData.callCount}</p>
		</div>
	));
