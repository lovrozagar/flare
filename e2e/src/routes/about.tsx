import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/about")
	.cache({
		ssr: {},
	})
	.preloader(() => ({ a: 1 }))
	.loader(({ preloaderContext }) => ({
		content: "This is the about page for the Flare E2E test app.",
		year: 2026,
	}))
	.head((ctx) => ({
		description: "About this app",
		title: `About - ${ctx.loaderData.year}`,
	}))
	.render((props) => {
		return (
			<main data-testid="about">
				<h1>About</h1>
				<p data-testid="about-content">{props.loaderData.content}</p>
				<p data-testid="about-year">{props.loaderData.year}</p>
				<nav>
					<Link to="/">Home</Link>
					<Link to="/blog">Blog</Link>
					<Link params={{ id: "1" }} to="/users/[id]">
						User 1
					</Link>
					<Link to="/head-demo">Head Demo</Link>
				</nav>
			</main>
		)
	})
