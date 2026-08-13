import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/chain-b")
	.loader(() => {
		throw redirect({ status: 302, to: "/chain-final" })
	})
	.render(() => <div>Should not render (chain-b)</div>)
