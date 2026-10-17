import { createPage } from "@lovrozagar/flare"
import { tabbed } from "@/validators.ts"

// The `.input()` object is imported through the app's `paths` alias, which the register writes as given (BUGS.md 349).
export const route = createPage("_root_/aliased/[id]")
	.input(tabbed)
	.render((props) => <p>{`${props.params.id.toFixed(0)} ${props.search.tab}`}</p>)
