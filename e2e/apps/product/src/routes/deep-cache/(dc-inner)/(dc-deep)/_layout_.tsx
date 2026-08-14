import { createLayout } from "flare/layout"

let callCount = 0

export const route = createLayout("_root_/(dc-l1)/(dc-l2)/(dc-l3)")
	.cache({ ssr: { staleTime: 8000, tags: ["dc-l3"], ttl: 60 } })
	.loader(() => {
		callCount++
		return { callCount, layer: "L3", ts: Date.now() }
	})
	.render((props) => (
		<div data-testid="dc-l3">
			<span data-testid="dc-l3-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-l3-ts">{props.loaderData.ts}</span>
			<span data-testid="dc-l3-calls">{props.loaderData.callCount}</span>
			{props.children}
		</div>
	))
