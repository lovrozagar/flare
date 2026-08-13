import { createPage } from "flare/page"

export const route = createPage("_root_/users/[id]")
	.loader((ctx) => {
		const id = ctx.location.params.id
		const url = new URL(ctx.request.url)
		return {
			id,
			origin: url.origin,
			path: url.pathname,
			platform: "CF Durable",
			timestamp: Date.now(),
		}
	})
	.head((ctx) => ({
		title: `User ${(ctx.loaderData as { id: string }).id} — CF Durable`,
	}))
	.render((props) => (
		<div>
			<h1 data-testid="user-heading">User — CF Durable</h1>
			<dl>
				<dt>ID</dt>
				<dd data-testid="user-id">{props.loaderData.id}</dd>
				<dt>Path</dt>
				<dd data-testid="user-path">{props.loaderData.path}</dd>
				<dt>Origin</dt>
				<dd data-testid="user-origin">{props.loaderData.origin}</dd>
				<dt>Platform</dt>
				<dd data-testid="user-platform">{props.loaderData.platform}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
				<a href="/users/42">User 42</a>
				<a href="/users/abc-def">User abc-def</a>
			</nav>
		</div>
	))
