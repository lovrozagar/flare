import { createPage } from "flare/page"

export const route = createPage("_root_/multi-cookie")
	.loader(({ request }) => {
		const cookies = request.headers.get("cookie") ?? ""
		const sessionCookie = cookies.match(/session=([^;]+)/)?.[1] ?? "none"
		const themeCookie = cookies.match(/theme=([^;]+)/)?.[1] ?? "none"
		const langCookie = cookies.match(/lang=([^;]+)/)?.[1] ?? "none"
		return {
			langCookie,
			platform: "Zeabur",
			sessionCookie,
			themeCookie,
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
		<div>
			<h1 data-testid="multi-cookie-heading">Multi Cookie — Zeabur</h1>
			<dl>
				<dt>Session</dt>
				<dd data-testid="mc-session">{props.loaderData.sessionCookie}</dd>
				<dt>Theme</dt>
				<dd data-testid="mc-theme">{props.loaderData.themeCookie}</dd>
				<dt>Lang</dt>
				<dd data-testid="mc-lang">{props.loaderData.langCookie}</dd>
			</dl>
			<nav>
				<a href="/multi-cookie">Reload (read cookies)</a>
				<a href="/">Home</a>
			</nav>
		</div>
	))
