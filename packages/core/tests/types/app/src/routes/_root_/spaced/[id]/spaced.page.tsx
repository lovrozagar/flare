import { createPage } from "@lovrozagar/flare"
import * as validators from "../../../../validators.ts"

// The `.input()` object is a namespace import's member (BUGS.md 349).
export const route = createPage("_root_/spaced/[id]")
	.input(validators.tabbed)
	.render((props) => <p>{`${props.params.id.toFixed(0)} ${props.search.tab}`}</p>)
