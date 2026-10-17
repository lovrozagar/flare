import { createPage } from "@lovrozagar/flare"
import { tabbed } from "../../../../validators.ts"

// The `.input()` object is imported from another module (BUGS.md 349).
export const route = createPage("_root_/imported/[id]")
	.input(tabbed)
	.render((props) => <p>{`${props.params.id.toFixed(0)} ${props.search.tab}`}</p>)
