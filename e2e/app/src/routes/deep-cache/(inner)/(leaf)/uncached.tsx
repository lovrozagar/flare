import { createPage } from "flare/page"

export const route = createPage("_root_/(dc-l1)/(dc-l2)/(dc-l3)/deep-cache/uncached")
	.loader(() => ({ layer: "P2-uncached", ts: Date.now() }))
	.render((props) => (
		<main data-testid="dc-p2">
			<span data-testid="dc-p2-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-p2-ts">{props.loaderData.ts}</span>
		</main>
	))
