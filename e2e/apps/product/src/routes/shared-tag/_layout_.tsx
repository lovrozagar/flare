import { createLayout } from "@lovrozagar/flare/layout";

let callCount = 0;

export const route = createLayout("_root_/(shared-tag)")
	.cache({ ssr: { staleTime: 5_000, tags: ["shared-tag"], ttl: 60 } })
	.loader(() => {
		callCount++;
		return { callCount, timestamp: Date.now() };
	})
	.render((props) => (
		<div data-testid="shared-tag-layout">
			<span data-testid="stag-layout-ts">{props.loaderData.timestamp}</span>
			<span data-testid="stag-layout-calls">{props.loaderData.callCount}</span>
			{props.children}
		</div>
	));
