import { redirect } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/redirect-307")
	.loader(() => {
		throw redirect({ status: 307, to: "/about" })
	})
	.render(() => <div>no</div>)
