import { createPage } from "flare/page"

export const route = createPage("_root_/empty-loader")
	.loader(() => ({}))
	.render((props) => (
		<div data-testid="empty-loader-page">
			<h1>Empty Loader</h1>
			<p data-testid="empty-loader-keys">{Object.keys(props.loaderData).length}</p>
		</div>
	))
