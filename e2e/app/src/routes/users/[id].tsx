import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/users/[id]")
	.loader((ctx) => {
		const id = ctx.location.params.id
		return {
			id,
			name: `User ${id}`,
			path: new URL(ctx.request.url).pathname,
		}
	})
	.head((ctx) => ({
		title: `User ${(ctx.loaderData as { id: string }).id}`,
	}))
	.render((props) => (
		<main data-testid="user">
			<h1 data-testid="user-heading">User</h1>
			<p data-testid="user-id">{props.loaderData.id}</p>
			<p data-testid="user-name">{props.loaderData.name}</p>
			<p data-testid="user-path">{props.loaderData.path}</p>
			<nav>
				<Link to="/">Home</Link>
				<Link params={{ id: "1" }} to="/users/[id]">
					User 1
				</Link>
				<Link params={{ id: "2" }} to="/users/[id]">
					User 2
				</Link>
			</nav>
		</main>
	))
