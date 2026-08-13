import { createPage } from "flare/page"

export const route = createPage("_root_/authorize-pass")
	.authenticate()
	.authorize(({ auth }) => {
		const a = auth as unknown as Record<string, unknown> | null
		return a?.userId === "admin"
	})
	.loader(({ auth }) => {
		const a = auth as unknown as Record<string, unknown> | null
		return { message: "Authorized", userId: String(a?.userId ?? "") }
	})
	.render((props) => (
		<div data-testid="authorize-pass">
			<p data-testid="authorize-message">{props.loaderData.message}</p>
			<p data-testid="authorize-user">{props.loaderData.userId}</p>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="authorize-error">
			<p data-testid="authorize-error-message">{props.error.message}</p>
		</div>
	))
	.unauthorizedRender((props) => (
		<div data-testid="authorize-unauthorized">
			<p>Unauthorized: {props.error.message}</p>
		</div>
	))
