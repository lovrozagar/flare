import { expect, it } from "vitest"
import { builtHref, builtSheet } from "./sheet.ts"

// The source module is empty. The server environment's copy holds the client's one stylesheet (vite/css/inject).
it("empty", () => {
	expect(builtSheet).toBe("")
	expect(builtHref).toBe("")
})
