import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(dc-l1)/(dc-l2)")
	.loader(() => ({ layer: "L2", ts: Date.now() }))
	.render((props) => (
		<div data-testid="dc-l2">
			<span data-testid="dc-l2-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-l2-ts">{props.loaderData.ts}</span>
			{props.children}
		</div>
	));
