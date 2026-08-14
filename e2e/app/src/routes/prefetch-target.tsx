import { createPage } from "flare/page"

export const route = createPage("_root_/prefetch-target")
	.cache({ client: { prefetch: "intent", staleTime: 60_000 } })
	.loader(() => ({ loaded: true, timestamp: Date.now() }))
	.render((props) => (
		<main data-testid="prefetch-target">
			<p data-testid="prefetch-loaded">{String(props.loaderData.loaded)}</p>
			<p data-testid="prefetch-ts">{props.loaderData.timestamp}</p>
		</main>
	))
