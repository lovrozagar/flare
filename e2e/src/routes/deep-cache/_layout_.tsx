import { createLayout } from "flare/layout"

let callCount = 0

export const route = createLayout("_root_/(dc-l1)")
	.cache({ ssr: { staleTime: 5000, tags: ["dc-l1"], ttl: 30 } })
	.loader(() => {
		callCount++
		return { callCount, layer: "L1", ts: Date.now() }
	})
	.render((props) => (
		<div data-testid="dc-l1">
			<span data-testid="dc-l1-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-l1-ts">{props.loaderData.ts}</span>
			<span data-testid="dc-l1-calls">{props.loaderData.callCount}</span>
			{props.children}
		</div>
	))
