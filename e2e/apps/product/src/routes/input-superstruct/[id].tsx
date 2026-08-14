import { createPage } from "flare/page"
import { create, defaulted, object, pattern, string } from "superstruct"

const ParamsStruct = object({ id: pattern(string(), /^\d+$/) })
const SearchStruct = object({
	limit: defaulted(string(), "10"),
	tab: defaulted(string(), "overview"),
})

export const route = createPage("_root_/input-superstruct/[id]")
	.input({
		params: { parse: (raw) => create(raw, ParamsStruct) },
		searchParams: (raw) => create(Object.fromEntries(raw), SearchStruct),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">superstruct</div>
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
