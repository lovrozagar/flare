import { createLayout } from "flare/layout"
import { Link } from "flare/link"

export const route = createLayout("_root_/(blog)")
	.loader(() => ({
		section: "Blog",
	}))
	.render((props) => (
		<div data-testid="blog-layout">
			<nav data-testid="blog-nav">
				<span>{props.loaderData.section}</span>
				<Link to="/blog">All Posts</Link>
			</nav>
			<div data-testid="blog-content">{props.children}</div>
		</div>
	))
