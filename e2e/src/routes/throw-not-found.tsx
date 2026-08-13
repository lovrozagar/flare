import { createPage } from "flare/page"
import { notFound } from "flare/errors"

export const route = createPage("_root_/throw-not-found")
	.loader(() => {
		notFound()
	})
	.render(() => <div>Should not render</div>)
