import { createPage } from "@lovrozagar/flare"

type Search = { q: string; page?: number }

function search(raw: Record<string, string | string[]>): Search {
	const page = raw["page"]
	const q = String(raw["q"] ?? "")
	return typeof page === "string" ? { q, page: Number(page) } : { q }
}

export const route = createPage("_root_/search")
	.input({ searchParams: search })
	.effects({ loaderDeps: (ctx) => [ctx.search["page"]] })
	.render((props) => <p>{props.search.q}</p>)
