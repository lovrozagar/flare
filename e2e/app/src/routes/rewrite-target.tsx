import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/rewrite-target")
	.loader(({ request }) => ({
		message: "Rewrite target page",
		pathname: new URL(request.url).pathname,
	}))
	.head(() => ({ title: "Rewrite Target" }))
	.render((props) => (
		<main data-testid="rewrite-target">
			<h1>Rewrite Target</h1>
			<p data-testid="rewrite-message">{props.loaderData.message}</p>
			<p data-testid="rewrite-pathname">{props.loaderData.pathname}</p>
			<nav>
				<Link data-testid="link-to-self" to="/rewrite-target">
					Self
				</Link>
			</nav>
		</main>
	))
