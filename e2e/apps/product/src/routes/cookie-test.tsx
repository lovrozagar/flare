import { createPage } from "flare/page"

export const route = createPage("_root_/cookie-test")
	.loader(({ request }) => {
		const cookies = request.headers.get("cookie") ?? ""
		const existing = cookies.includes("flare-session=")
			? (cookies.match(/flare-session=([^;]+)/)?.[1] ?? "none")
			: "none"
		return {
			existingSession: existing,
			message: "Cookie test page",
			newToken: `tok-${Date.now()}`,
		}
	})
	.headers(({ loaderData }) => ({
		"set-cookie": `flare-session=${(loaderData as { newToken: string }).newToken}; Path=/; HttpOnly; SameSite=Lax`,
	}))
	.render((props) => (
		<div data-testid="cookie-test">
			<p data-testid="cookie-message">{props.loaderData.message}</p>
			<p data-testid="cookie-token">{props.loaderData.newToken}</p>
			<p data-testid="cookie-existing">{props.loaderData.existingSession}</p>
		</div>
	))
