import { createPage } from "flare/page"
import * as z from "zod"

export const route = createPage("_root_/input-zod/[id]")
	.input({
		params: z.object({ id: z.string().regex(/^\d+$/) }),
		searchParams: (raw) => {
			const obj = Object.fromEntries(raw)
			return z
				.object({
					limit: z.string().default("10"),
					tab: z.string().default("overview"),
				})
				.parse(obj)
		},
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">zod</div>
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
