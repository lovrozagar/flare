import { createPage } from "@lovrozagar/flare";

// Two prerendered slugs. Any other slug is the router's 404 (static.test).
export const route = createPage("_root_/static/[slug]")
	.cache({ ssg: () => [{ slug: "a" }, { slug: "b" }] })
	.loader(({ params }) => ({ slug: params.slug }))
	.render((props) => <p id="static">static {props.loaderData.slug}</p>);
