import { createPage } from "flare/page"

export const route = createPage("_root_/input-manual/[id]")
	.input({
		params: (raw) => {
			if (typeof raw.id !== "string" || !/^\d+$/.test(raw.id)) {
				throw new Error("Invalid id: must be numeric")
			}
			return { id: raw.id }
		},
		searchParams: (raw) => ({
			limit: raw.get("limit") ?? "10",
			tab: raw.get("tab") ?? "overview",
		}),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">manual</div>
			<div data-testid="input-id">{props.loaderData.id}</div>
			<div data-testid="input-tab">{props.loaderData.tab}</div>
			<div data-testid="input-limit">{props.loaderData.limit}</div>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="input-error">
			<p data-testid="input-error-message">{props.error.message}</p>
		</div>
	))
