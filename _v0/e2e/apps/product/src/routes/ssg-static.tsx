import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/ssg-static")
	.cache({ ssg: true })
	.loader(() => ({ renderedAt: Date.now(), source: "ssg" }))
	.render((props) => (
		<main data-testid="ssg-static">
			<p data-testid="ssg-static-source">{props.loaderData.source}</p>
			<p data-testid="ssg-static-rendered-at">{props.loaderData.renderedAt}</p>
		</main>
	));
