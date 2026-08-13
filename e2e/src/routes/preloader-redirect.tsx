import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/preloader-redirect")
	.preloader(() => {
		redirect({ to: "/redirect-target" })
	})
	.render(() => <div>Should not render</div>)
