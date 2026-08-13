import { createPage } from "flare/page"

export const route = createPage("_root_/about")
	.loader(({ request }) => {
		const host = request.headers.get("host") ?? "unknown"
		const cookies = request.headers.get("cookie") ?? ""
		const visitCookie = cookies.match(/flare-visit=([^;]+)/)?.[1] ?? "none"
		return {
			host,
			platform: "CF Workers",
			rendered: new Date().toISOString(),
			visitCookie,
		}
	})
	.headers(() => ({
		"cache-control": "no-store",
		"x-powered-by": "flare",
	}))
	.render((props) => (
		<div>
			<h1 data-testid="about-heading">About — CF Workers</h1>
			<nav>
				<a href="/">Home</a>
			</nav>
			<dl>
				<dt>Platform</dt>
				<dd data-testid="platform">{props.loaderData.platform}</dd>
				<dt>Host</dt>
				<dd data-testid="host">{props.loaderData.host}</dd>
				<dt>Rendered</dt>
				<dd data-testid="rendered">{props.loaderData.rendered}</dd>
				<dt>Visit Cookie</dt>
				<dd data-testid="visit-cookie">{props.loaderData.visitCookie}</dd>
			</dl>
		</div>
	))
