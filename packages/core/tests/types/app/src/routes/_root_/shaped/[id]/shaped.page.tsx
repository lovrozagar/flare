import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/shaped/[id]")
	.input({ params: (raw: Record<string, string | string[]>) => ({ id: Number(raw["id"]) }) })
	.render((props) => <p>{props.params.id.toFixed(0)}</p>);
