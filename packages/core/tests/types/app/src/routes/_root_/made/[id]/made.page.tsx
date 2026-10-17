import { createPage } from "@lovrozagar/flare"
import { paged } from "../../../../validators.ts"

// The `.input()` object is a factory's result (BUGS.md 349).
export const route = createPage("_root_/made/[id]")
	.input(paged((raw) => ({ page: Number(raw["page"] ?? "1") })))
	.render((props) => <p>{`${props.params.id.toFixed(0)} ${props.search.page.toFixed(0)}`}</p>)
