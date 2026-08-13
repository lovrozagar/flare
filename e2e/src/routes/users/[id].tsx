import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/users/[id]")
	.loader((ctx) => ({
		id: ctx.location.params.id,
		name: `User ${ctx.location.params.id}`,
	}))
	.head((ctx) => ({
		title: `User ${ctx.loaderData.id}`,
	}))
	.render((props) => (
		<main data-testid="user-page">
			<h1 data-testid="user-name">{props.loaderData.name}</h1>
			<p data-testid="user-id">{props.loaderData.id}</p>
			<nav>
				<Link params={{ id: "1" }} to="/users/[id]">
					User 1
				</Link>
				<Link params={{ id: "2" }} to="/users/[id]">
					User 2
				</Link>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
