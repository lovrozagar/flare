import { redirect } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/redirect-302")
	.loader(() => {
		throw redirect({ status: 302, to: "/about" })
	})
	.render(() => <div>Should not render</div>)
