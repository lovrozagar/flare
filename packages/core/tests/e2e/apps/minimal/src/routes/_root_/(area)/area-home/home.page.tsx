import { createPage, Link } from "@lovrozagar/flare"

// The way into /area-missing by a client navigation.
export const route = createPage("_root_/(area)/area-home").render(() => (
	<Link id="to-area-missing" to="_root_/(area)/area-missing">
		area missing
	</Link>
))
