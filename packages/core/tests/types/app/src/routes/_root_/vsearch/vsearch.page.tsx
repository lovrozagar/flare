import { createPage } from "@lovrozagar/flare"

// The validators held in a module-level const, not written inside `.input()` (BUGS.md 346).
const validators = {
	searchParams: (raw: Record<string, string | string[]>) => ({ page: Number(raw["page"]) }),
}

export const route = createPage("_root_/vsearch")
	.input(validators)
	.render((props) => <p>{props.search.page.toFixed(0)}</p>)
