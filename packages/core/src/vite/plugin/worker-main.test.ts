import { expect, it } from "vitest"

// Outside Vite nothing resolves the Wrangler main to the app's server, so loading the file itself names why (B109).
it("outside vite", async () => {
	await expect(import("./worker-main.ts")).rejects.toThrow(
		"@lovrozagar/flare/worker is the Wrangler main for the Cloudflare plugin: it runs only inside Vite with flare()",
	)
})
