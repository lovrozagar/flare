import { createPage } from "flare/page"
import * as yup from "yup"

const paramsSchema = yup.object({ id: yup.string().matches(/^\d+$/).required() })
const searchSchema = yup.object({
	limit: yup.string().default("10"),
	tab: yup.string().default("overview"),
})

export const route = createPage("_root_/input-yup/[id]")
	.input({
		params: { parse: (raw) => paramsSchema.validateSync(raw) },
		searchParams: (raw) => searchSchema.validateSync(Object.fromEntries(raw)),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">yup</div>
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
