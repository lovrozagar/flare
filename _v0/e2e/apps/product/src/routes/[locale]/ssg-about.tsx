import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/[locale]/ssg-about")
	.cache({
		ssg: true,
	})
	.loader((ctx) => ({
		locale: ctx.location.params.locale,
	}))
	.render((props) => (
		<div data-testid="ssg-about">
			<p data-testid="ssg-about-locale">{props.loaderData.locale}</p>
		</div>
	));
