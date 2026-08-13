import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/old-page")
	.loader(() => {
		throw redirect({ status: 302, to: "/about" })
	})
	.render(() => <div>Should not render</div>)
