import { createPage } from "@lovrozagar/flare/page";
import * as Schema from "@effect/schema/Schema";

const ParamsSchema = Schema.Struct({ id: Schema.String.pipe(Schema.pattern(/^\d+$/)) });
const SearchSchema = Schema.Struct({
	limit: Schema.optionalWith(Schema.String, { default: () => "10" }),
	tab: Schema.optionalWith(Schema.String, { default: () => "overview" }),
});

export const route = createPage("_root_/input-effect/[id]")
	.input({
		params: { parse: (raw) => Schema.decodeUnknownSync(ParamsSchema)(raw) },
		searchParams: (raw) => Schema.decodeUnknownSync(SearchSchema)(Object.fromEntries(raw)),
	})
	.loader((ctx) => ({
		id: Number(ctx.location.params.id),
		limit: Number(ctx.location.search.limit),
		tab: ctx.location.search.tab,
	}))
	.render((props) => (
		<div data-testid="input-page">
			<div data-testid="input-lib">effect</div>
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
