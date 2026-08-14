import { createPage } from "flare/page"

export const route = createPage("_root_/(blog)/blog/[slug]")
	.loader((ctx) => ({
		slug: ctx.location.params.slug,
		title: `Post: ${ctx.location.params.slug}`,
	}))
	.render((props) => (
		<main data-testid="blog-post">
			<h1 data-testid="post-title">{props.loaderData.title}</h1>
			<p data-testid="post-slug">{props.loaderData.slug}</p>
		</main>
	))
