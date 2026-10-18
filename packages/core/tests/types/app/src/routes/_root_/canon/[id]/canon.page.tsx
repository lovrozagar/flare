import { createPage, redirect } from "@lovrozagar/flare"

type Raw = Record<string, string | string[]>

// A canonical id: the page validates its params and its loader redirects to itself with params.
// Its loader redirects with params to a route that validates them, so its return is annotated (BUGS.md 350).
export const route = createPage("_root_/canon/[id]")
	.input({ params: (raw: Raw) => ({ id: Number(raw["id"]) }) })
	.loader(({ params }): { n: number } => {
		if (params.id === 0) redirect({ to: "_root_/canon/[id]", params: { id: 1 } })
		return { n: params.id }
	})
	.render((props) => <p>{props.loaderData.n}</p>)
