import { createPage } from "flare/page"

export const route = createPage("_root_/null-loader")
	.loader(() => null as unknown as Record<string, never>)
	.render((props) => (
		<main data-testid="null-loader-page">
			<p data-testid="null-loader-value">{String(props.loaderData)}</p>
		</main>
	))
