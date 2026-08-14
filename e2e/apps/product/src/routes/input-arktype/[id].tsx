import { createPage } from "flare/page"
import { type } from "arktype"

const ParamsType = type({ id: "string.numeric" })

export const route = createPage("_root_/input-arktype/[id]")
	.input({
		params: {
			parse: (raw) => {
				const result = ParamsType(raw)
				if (result instanceof type.errors) throw new Error(result.summary)
				return result
			},
		},
		searchParams: (raw) => {
			const obj = Object.fromEntries(raw)
			return {
				limit: obj.limit ?? "10",
				tab: obj.tab ?? "overview",
			}
		},
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">arktype</div>
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
