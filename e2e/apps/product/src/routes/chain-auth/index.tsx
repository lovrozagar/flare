import { createPage } from "flare/page"

export const route = createPage("_root_/(chain-auth)/chain-auth")
	.loader(({ auth }) => ({
		childUser: String((auth as { userId?: string } | null)?.userId ?? ""),
	}))
	.render((props) => (
		<main data-testid="chain-auth-child">
			<p data-testid="auth-child-user">{props.loaderData.childUser}</p>
		</main>
	))
