import { createPage } from "flare/page"
import { redirect } from "flare/errors"

export const route = createPage("_root_/chain-a")
	.loader(() => {
		throw redirect({ status: 302, to: "/chain-b" })
	})
	.render(() => <div>Should not render (chain-a)</div>)
