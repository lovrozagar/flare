import { createPage } from "@lovrozagar/flare";

function filter(raw: Record<string, string | string[]>): { tag?: string } {
	const tag = raw["tag"];
	return typeof tag === "string" ? { tag } : {};
}

export const route = createPage("_root_/filter")
	.input({ searchParams: filter })
	.render((props) => <p>{props.search.tag ?? "all"}</p>);
