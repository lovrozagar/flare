import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dc-l1)/(dc-l2)/(dc-l3)")
	.cache({ ssr: { staleTime: 2000, tags: ["dc-l3"], ttl: 30 } })
	.loader(() => ({ layer: "L3", ts: Date.now() }))
	.render((props) => (
		<div data-testid="dc-l3">
			<span data-testid="dc-l3-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-l3-ts">{props.loaderData.ts}</span>
			{props.children}
		</div>
	))
