import { createLayout } from "flare/layout"
import { Link } from "flare/link"

export const route = createLayout("_root_/(styling-head-css-shared)")
	.head(() => ({ css: "/shared-layout.css" }))
	.render((p) => (
		<div class="shared-layout-el" data-testid="shared-layout">
			<nav>
				<Link to="/styling-child-a">Child A</Link>
				{" | "}
				<Link to="/styling-child-b">Child B</Link>
			</nav>
			{p.children}
		</div>
	))
