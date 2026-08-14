import { createPage } from "flare/page"
import { Type } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

const ParamsType = Type.Object({ id: Type.String({ pattern: "^\\d+$" }) })
const SearchType = Type.Object({
	limit: Type.String({ default: "10" }),
	tab: Type.String({ default: "overview" }),
})

export const route = createPage("_root_/input-typebox/[id]")
	.input({
		params: { parse: (raw) => Value.Parse(ParamsType, raw) },
		searchParams: (raw) => Value.Parse(SearchType, Object.fromEntries(raw)),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">typebox</div>
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
