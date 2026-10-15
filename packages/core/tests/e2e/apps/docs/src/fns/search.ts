import { createServerFn } from "@lovrozagar/flare/server-fn"
import { searchIndex } from "../search-index.ts"
import { invalid } from "./issues.ts"

// A public GET, so its answer may be cached by the browser and a CDN for a minute (dx/server-fn.md `cache`).
export const searchDocs = createServerFn({ method: "get" })
	.input({
		parse: (value: { q: string }) => {
			if (typeof value.q !== "string" || value.q.length > 80) invalid("q", "Search for 80 characters or fewer")
			return { q: value.q }
		},
	})
	.cache({ maxAge: "1m" })
	.handler(({ input }) => ({ q: input.q, hits: searchIndex(input.q) }))
