import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/empty-loader")
	.loader(() => ({}))
	.render((props) => (
		<main data-testid="empty-loader-page">
			<p data-testid="empty-loader-keys">{Object.keys(props.loaderData).length}</p>
		</main>
	));
