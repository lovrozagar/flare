import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(opt-single-param)/opt-single-param/[[lang]]/about")
	.loader((ctx) => {
		const lang = ctx.location.params.lang ?? "default";
		return { lang };
	})
	.head((ctx) => ({ title: `About: ${ctx.loaderData.lang}` }))
	.render((props) => (
		<main data-testid="opt-single-about">
			<h1 data-testid="about-lang">{props.loaderData.lang}</h1>
			<p>About page with optional lang</p>
		</main>
	));
