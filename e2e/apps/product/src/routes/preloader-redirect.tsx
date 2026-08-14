import { redirect } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/preloader-redirect")
	.preloader(() => {
		throw redirect({ to: "/redirect-target" })
	})
	.loader(() => ({ reached: true }))
	.render(() => <div>no</div>)
