import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(blog)/blog/[slug]")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render((props) => <main data-testid="blog-post">{String(props.location.params.slug)}</main>);
