import { createPage } from "flare/page"

export const route = createPage("_root_/isr-allowlist/[slug]")
	.cache({
		isr: {
			dynamicParams: false,
			params: () => [{ slug: "alpha" }, { slug: "beta" }],
			revalidate: 10,
		},
	})
	.loader((ctx) => ({
		renderedAt: Date.now(),
		slug: ctx.location.params.slug,
	}))
	.render((props) => (
		<main data-testid="isr-allowlist">
			<p data-testid="isr-allowlist-slug">{props.loaderData.slug}</p>
			<p data-testid="isr-allowlist-rendered-at">{props.loaderData.renderedAt}</p>
		</main>
	))
