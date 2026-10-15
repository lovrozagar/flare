import { expect, it } from "vitest"
import { broadcastEnabled } from "./enabled.ts"

// `flare({ broadcast: false })` replaces this module in the client environment. The source is on (dx/plugin.md).
it("on", () => {
	expect(broadcastEnabled).toBe(true)
})
