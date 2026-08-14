import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/redirect-source")
	.loader(() => {
		throw redirect({ status: 302, to: "/redirect-target" })
	})
	.render(() => <div>Should not render</div>)
