import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/slow")
	.loader(async () => {
		await new Promise((r) => setTimeout(r, 1500));
		return { loaded: true };
	})
	.render((props) => (
		<div data-testid="slow-page">
			<h1>Slow Page</h1>
			<p data-testid="slow-loaded">{String(props.loaderData.loaded)}</p>
		</div>
	));
