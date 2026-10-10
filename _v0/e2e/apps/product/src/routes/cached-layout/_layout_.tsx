import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(cached-layout)")
	.cache({ ssr: { staleTime: 5000, ttl: 30 } })
	.loader(() => ({
		layoutData: "cached-layout",
		layoutTs: Date.now(),
	}))
	.render((props) => (
		<div data-testid="cached-layout">
			<header data-testid="cached-layout-header">
				<span data-testid="cached-layout-data">{props.loaderData.layoutData}</span>
				<span data-testid="cached-layout-ts">{props.loaderData.layoutTs}</span>
			</header>
			<main data-testid="cached-layout-content">{props.children}</main>
		</div>
	));
