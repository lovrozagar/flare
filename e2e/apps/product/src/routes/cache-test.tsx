import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/cache-test")
	.cache({ client: { staleTime: 30_000 } })
	.loader(() => ({
		random: Math.random(),
		timestamp: Date.now(),
	}))
	.render((props) => (
		<main data-testid="cache-test">
			<p data-testid="cache-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="cache-random">{props.loaderData.random}</p>
		</main>
	));
