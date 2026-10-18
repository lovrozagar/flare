import { createPage, redirect } from "@lovrozagar/flare"
import { DEFAULT_SEARCH } from "../../search.ts"

// `/app` sends a signed-in user to the projects and anyone else to the sign-in page.
export const route = createPage("_root_/")
	.authenticateOptional()
	.loader(({ auth }) => {
		throw auth === null
			? redirect({ to: "_root_/login" })
			: redirect({ to: "_root_/(app)/projects", search: DEFAULT_SEARCH })
	})
	.render(() => null)
