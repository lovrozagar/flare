import { revalidate } from "@lovrozagar/flare/server"
import { createServerFn } from "@lovrozagar/flare/server-fn"

// Admin only. Bumping the `api` tag makes the next API reference request render again (dx/store.md revalidate).
export const republish = createServerFn()
	.authenticate()
	.authorize(({ auth }) => auth.role === "admin")
	.handler(async () => {
		await revalidate({ tags: ["api"] })
		return { purged: ["api"] }
	})
