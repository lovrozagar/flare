import { expect, it } from "vitest"
import { deferredFailure, failureError, isDeferredFailure, isFailureError } from "./deferred-failure.ts"

// A failure is its own marked value: the projected error rebuilds as an Error with that name, message, and stack, and
// nothing else reads as a failure (BUGS.md 374).
it("deferred failure", () => {
	const failure = deferredFailure({ name: "TypeError", message: "down", stack: "at x" })
	expect(isDeferredFailure(failure)).toBe(true)
	expect(isDeferredFailure({ error: failure.error })).toBe(false)
	expect(isDeferredFailure(null)).toBe(false)
	expect(isDeferredFailure("down")).toBe(false)
	const error = failureError(failure)
	expect(error).toBeInstanceOf(Error)
	expect([error.name, error.message, error.stack]).toEqual(["TypeError", "down", "at x"])
	expect(failureError(deferredFailure({ name: "Error", message: "Something went wrong" })).stack).toBe("")
	expect(isFailureError(error)).toBe(true)
	expect(isFailureError(new Error("down"))).toBe(false)
	expect(isFailureError("down")).toBe(false)
})
