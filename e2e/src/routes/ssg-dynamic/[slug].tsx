import { createPage } from "flare/page"

export const route = createPage("_root_/(ssg-dynamic)/ssg-dynamic/[slug]")
	.cache({
		ssg: {
			params: () => [{ slug: "hello" }, { slug: "world" }],
		},
	})
	.loader((ctx) => ({
		slug: ctx.location.params.slug,
	}))
	.render((props) => (
		<div data-testid="ssg-dynamic">
			<p data-testid="ssg-dynamic-slug">{props.loaderData.slug}</p>
		</div>
	))
