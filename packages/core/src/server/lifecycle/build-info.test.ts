import { expect, it } from "vitest"
import { buildId, clientEntry } from "./build-info.ts"

// The source module, as a server without the plugin sees it: the dev id and no client script. flare() replaces it in
// the ssr and worker environments (vite/plugin/build-id.ts).
it("source", () => {
	expect(buildId).toBe("dev")
	expect(clientEntry).toBeUndefined()
})
