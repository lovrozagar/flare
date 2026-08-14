import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/(products)/products/").render(() => (
	<main data-testid="product-list">
		<Link data-testid="product-link-1" params={{ id: "1" }} to="/products/[id]">
			Widget
		</Link>
	</main>
))
