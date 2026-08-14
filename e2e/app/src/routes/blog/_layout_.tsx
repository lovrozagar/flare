import { createLayout } from "flare/layout"
import { Link } from "flare/link"

export const route = createLayout("_root_/(blog)")
	.loader(() => ({ section: "blog" }))
	.render((props) => (
		<div data-testid="blog-layout">
			<p data-testid="blog-nav">{props.loaderData.section}</p>
			<nav>
				<Link to="/blog">Index</Link>
			</nav>
			{props.children}
		</div>
	))
