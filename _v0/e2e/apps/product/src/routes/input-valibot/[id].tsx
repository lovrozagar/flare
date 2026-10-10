import { createPage } from "@lovrozagar/flare/page";
import * as v from "valibot";

const paramsSchema = v.object({ id: v.pipe(v.string(), v.regex(/^\d+$/)) });
const searchSchema = v.object({
	limit: v.optional(v.string(), "10"),
	tab: v.optional(v.string(), "overview"),
});

export const route = createPage("_root_/input-valibot/[id]")
	.input({
		params: { parse: (raw) => v.parse(paramsSchema, raw) },
		searchParams: (raw) => v.parse(searchSchema, Object.fromEntries(raw)),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">valibot</div>
			<div data-testid="input-id">{props.loaderData.id}</div>
			<div data-testid="input-tab">{props.loaderData.tab}</div>
			<div data-testid="input-limit">{props.loaderData.limit}</div>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="input-error">
			<p data-testid="input-error-message">{props.error.message}</p>
		</div>
	));
