import { createPage } from "flare/page"

export const route = createPage("_root_/caller-data")
	.authenticate("role:editor", "scope:write")
	.loader(({ auth }) => {
		const a = auth as unknown as Record<string, unknown> | null
		return {
			callerData: (a?.callerData ?? []) as unknown[],
			message: "Caller data route",
			userId: String(a?.userId ?? ""),
		}
	})
	.render((props) => (
		<div data-testid="caller-data">
			<p data-testid="caller-data-message">{props.loaderData.message}</p>
			<p data-testid="caller-data-user">{props.loaderData.userId}</p>
			<p data-testid="caller-data-args">{JSON.stringify(props.loaderData.callerData)}</p>
		</div>
	))
