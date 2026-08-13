import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/rewrite-target")
	.loader(({ request }) => ({
		message: "Rewrite target page",
		url: request.url,
	}))
	.head(() => ({ title: "Rewrite Target" }))
	.render((props) => (
		<main data-testid="rewrite-target">
			<h1>Rewrite Target</h1>
			<p data-testid="rewrite-message">{props.loaderData.message}</p>
			<nav>
				<Link data-testid="link-to-about" to="/about">
					About
				</Link>
				<Link data-testid="link-to-home" to="/">
					Home
				</Link>
				<Link data-testid="link-to-self" to="/rewrite-target">
					Self (should rewrite to /alt-target)
				</Link>
			</nav>
		</main>
	))
