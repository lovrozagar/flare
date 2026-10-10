import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("[[locale]]/_root_/(vt)/vt-shell/[id]")
	.loader((ctx) => ({ id: String(ctx.location.params.id) }))
	.render((props) => <h1 data-testid="vt-page">Item {props.loaderData.id}</h1>);
