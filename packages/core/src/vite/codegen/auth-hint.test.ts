import { expect, it } from "vitest"
import { authHint } from "./auth-hint.ts"

const none = { authorize: false }

it("hint", () => {
	// A page under an auth layout requires, whatever the page itself does.
	expect(authHint([none, { auth: true, authorize: false }, none])).toBe("requires")
	expect(
		authHint([
			{ auth: "optional", authorize: false },
			{ auth: true, authorize: false },
		]),
	).toBe("requires")
	// authenticateOptional, or authorize without authenticate, reads (B26).
	expect(authHint([none, { auth: "optional", authorize: false }])).toBe("reads")
	expect(authHint([none, { authorize: true }])).toBe("reads")
	expect(authHint([none, none])).toBe("public")
	expect(authHint([])).toBe("public")
})
