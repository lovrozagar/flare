import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(chain-override)")
	.preloader(() => ({
		layoutOnly: true,
		shared: "layout",
	}))
	.loader((ctx) => ({
		layoutPreloaderContext: ctx.preloaderContext,
	}))
	.render((props) => (
		<div data-testid="chain-override-layout">
			<div data-testid="layout-shared">{String(props.preloaderContext.shared)}</div>
			<div data-testid="layout-layoutOnly">{String(props.preloaderContext.layoutOnly)}</div>
			<div data-testid="layout-has-pageOnly">{String("pageOnly" in props.preloaderContext)}</div>
			<div data-testid="layout-snapshot">
				{JSON.stringify(props.loaderData.layoutPreloaderContext)}
			</div>
			{props.children}
		</div>
	))
