import { createPage } from "flare/page"

export const route = createPage("_root_/(headers-group)/headers-chain/headers-child")
	.loader(() => ({ content: "Headers chain child" }))
	.headers(({ parentHeaders }) => ({
		...parentHeaders,
		"x-child-header": "from-child",
		"x-shared": "child-override",
	}))
	.render((props) => (
		<div data-testid="headers-chain-child">
			<p data-testid="headers-child-content">{props.loaderData.content}</p>
		</div>
	))
