import { redirect } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/old-page")
	.loader(() => {
		throw redirect({ to: "/about" })
	})
	.render(() => <div>Should not render</div>)
