import { notFound } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/throw-not-found")
	.loader(() => {
		notFound()
	})
	.render(() => <div>Should not render</div>)
