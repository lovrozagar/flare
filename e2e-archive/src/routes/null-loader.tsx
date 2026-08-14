import { createPage } from "flare/page"

export const route = createPage("_root_/null-loader")
	.loader(() => null as unknown as Record<string, never>)
	.render((props) => (
		<div data-testid="null-loader-page">
			<h1>Null Loader</h1>
			<p data-testid="null-loader-value">{String(props.loaderData)}</p>
		</div>
	))
