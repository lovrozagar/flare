import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/multi-cookie")
	.loader(({ request }) => {
		const cookies = request.headers.get("cookie") ?? ""
		return {
			langCookie: cookies.match(/lang=([^;]+)/)?.[1] ?? "none",
			sessionCookie: cookies.match(/session=([^;]+)/)?.[1] ?? "none",
			themeCookie: cookies.match(/theme=([^;]+)/)?.[1] ?? "none",
		}
	})
	.headers(() => ({
		"set-cookie": [
			"session=abc123; Path=/; SameSite=Lax",
			"theme=dark; Path=/; SameSite=Lax",
			"lang=en; Path=/; SameSite=Lax",
		],
	}))
	.render((props) => (
		<main data-testid="multi-cookie">
			<h1 data-testid="multi-cookie-heading">Multi Cookie</h1>
			<p data-testid="mc-session">{props.loaderData.sessionCookie}</p>
			<p data-testid="mc-theme">{props.loaderData.themeCookie}</p>
			<p data-testid="mc-lang">{props.loaderData.langCookie}</p>
			<nav>
				<Link to="/multi-cookie">Reload</Link>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
