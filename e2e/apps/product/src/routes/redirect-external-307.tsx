import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/redirect-external-307")
	.loader(() => {
		throw redirect({ href: "https://example.com/path?q=test", status: 307 })
	})
	.render(() => <div>Should not render</div>)
