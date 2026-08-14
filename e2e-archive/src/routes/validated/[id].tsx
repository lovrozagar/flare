import { createPage } from "flare/page"

export const route = createPage("_root_/validated/[id]")
	.input({
		params: (raw) => {
			const id = raw.id
			if (typeof id !== "string" || !/^\d+$/.test(id)) {
				throw new Error("Invalid id: must be numeric")
			}
			return { id }
		},
		searchParams: (raw) => ({
			tab: raw.get("tab") ?? "overview",
		}),
	})
	.loader((ctx) => ({
		id: ctx.location.params.id,
		message: `Validated user ${ctx.location.params.id}`,
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="validated-page">
			<div data-testid="validated-id">{props.loaderData.id}</div>
			<div data-testid="validated-message">{props.loaderData.message}</div>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="validated-error">
			<p data-testid="validated-error-message">{props.error.message}</p>
		</div>
	))
