import { createPage } from "flare/page"

export const route = createPage("_root_/guarded")
	.authenticate()
	.loader(({ auth }) => ({
		userId: (auth as { userId: string }).userId,
	}))
	.render((props) => (
		<main data-testid="guarded">
			<h1>Guarded</h1>
			<p data-testid="guarded-user">{props.loaderData.userId}</p>
		</main>
	))
	.unauthenticatedRender(() => (
		<div data-testid="guarded-unauthenticated">
			<p>Auth required</p>
		</div>
	))
