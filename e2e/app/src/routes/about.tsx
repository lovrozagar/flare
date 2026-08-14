import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/about")
	.loader(({ request }) => {
		const cookies = request.headers.get("cookie") ?? ""
		const visitCookie = cookies.match(/flare-visit=([^;]+)/)?.[1] ?? "none"
		return {
			content: "About the current Flare consumer.",
			visitCookie,
			year: 2026,
		}
	})
	.head((ctx) => ({
		description: "About this app",
		title: `About - ${ctx.loaderData.year}`,
	}))
	.headers(() => ({
		"cache-control": "no-store",
	}))
	.render((props) => (
		<main data-testid="about">
			<h1 data-testid="about-heading">About</h1>
			<p data-testid="about-content">{props.loaderData.content}</p>
			<p data-testid="about-year">{props.loaderData.year}</p>
			<p data-testid="visit-cookie">{props.loaderData.visitCookie}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
