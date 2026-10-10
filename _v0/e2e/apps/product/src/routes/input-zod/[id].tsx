import { createPage } from "@lovrozagar/flare/page";
import * as z from "zod";

export const route = createPage("_root_/input-zod/[id]")
	.input({
		params: z.object({ id: z.string().regex(/^\d+$/) }),
		searchParams: (raw) => {
			const obj = Object.fromEntries(raw);
			return z
				.object({
					limit: z.string().default("10"),
					tab: z.string().default("overview"),
				})
				.parse(obj);
		},
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<main data-testid="input-page">
			<p data-testid="input-lib">zod</p>
			<p data-testid="input-id">{props.loaderData.id}</p>
			<p data-testid="input-tab">{props.loaderData.tab}</p>
			<p data-testid="input-limit">{props.loaderData.limit}</p>
		</main>
	))
	.errorRender((props) => (
		<div data-testid="input-error">
			<p data-testid="input-error-message">{props.error.message}</p>
		</div>
	));
