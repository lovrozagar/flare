import { createPage } from "@lovrozagar/flare"

// A params validator whose output is `never`: the register keeps it, not the bracket params (BUGS.md 349).
export const route = createPage("_root_/void/[id]")
	.input({
		params: (): never => {
			throw new Error("no params")
		},
	})
	.render(() => <p>void</p>)
