import { createPage } from "@lovrozagar/flare"

type Raw = Record<string, string | string[]>

// Validators whose outputs are unions with no key in common (BUGS.md 348).
export const route = createPage("_root_/either/[id]")
	.input({
		params: (raw: Raw): { n: number } | { s: string } => (raw["id"] === "1" ? { n: 1 } : { s: String(raw["id"]) }),
		searchParams: (raw: Raw): { a: string } | { b: string } => (raw["a"] === undefined ? { b: "b" } : { a: "a" }),
	})
	.render(() => <p>either</p>)
