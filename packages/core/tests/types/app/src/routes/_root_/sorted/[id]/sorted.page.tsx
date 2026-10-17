import { createPage } from "@lovrozagar/flare"
import sorting from "../../../../validators.ts"

// The `.input()` object is a default import that validates search only (BUGS.md 349).
export const route = createPage("_root_/sorted/[id]")
	.input(sorting)
	.render((props) => <p>{`${props.params.id} ${props.search.sort}`}</p>)
