import { createPage } from "flare/page"

export const route = createPage("_root_/(ham-layout)/head-auto-merge/replaced")
	.head(
		() => ({
			title: "Replaced Page",
		}),
		{ replace: true },
	)
	.render(() => <div data-testid="ham-replaced">Replace mode active</div>)
