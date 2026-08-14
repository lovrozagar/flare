import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/redirect-external")
	.loader(() => {
		throw redirect({ href: "https://example.com" })
	})
	.render(() => <div>Should not render</div>)
