import { createServerFn } from "@lovrozagar/flare/server-fn"

// The overview's live feed: one event every 250 ms for as long as the page reads it, up to 200. Leaving the page stops
// the iteration, which aborts the request, and the generator ends at its next wait (dx/server-fn.md stream).
export const activityFeed = createServerFn({ method: "get" })
	.authenticate()
	.stream(async function* ({ auth, signal }) {
		for (let index = 1; index <= 200 && !signal.aborted; index += 1) {
			await new Promise((resolve) => setTimeout(resolve, 250))
			yield { index, text: `${auth.name} event ${index}` }
		}
	})
