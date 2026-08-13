import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dc-l1)/(dc-l2)/(dc-l3)/(dc-l4)")
	.loader(() => ({ layer: "L4", ts: Date.now() }))
	.render((props) => (
		<div data-testid="dc-l4">
			<span data-testid="dc-l4-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-l4-ts">{props.loaderData.ts}</span>
			{props.children}
		</div>
	))
