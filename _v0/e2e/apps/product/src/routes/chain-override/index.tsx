import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(chain-override)/chain-override/")
	.preloader(() => ({
		pageOnly: true,
		shared: "page",
	}))
	.loader((ctx) => ({
		pagePreloaderContext: ctx.preloaderContext,
	}))
	.render((props) => (
		<div data-testid="chain-override-page">
			<div data-testid="page-shared">{String(props.preloaderContext.shared)}</div>
			<div data-testid="page-layoutOnly">{String(props.preloaderContext.layoutOnly)}</div>
			<div data-testid="page-pageOnly">{String(props.preloaderContext.pageOnly)}</div>
			<div data-testid="page-snapshot">{JSON.stringify(props.loaderData.pagePreloaderContext)}</div>
		</div>
	));
