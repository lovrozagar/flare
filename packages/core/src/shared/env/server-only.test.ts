import { expect, it, vi } from "vitest"
import { createServerOnlyFn } from "./server-only.ts"

it("returns", () => {
	const body = vi.fn<(n: number) => number>((n) => n + 1)
	const read = createServerOnlyFn(body)
	expect(read(1)).toBe(2)
	expect(body).toHaveBeenCalledExactlyOnceWith(1)
})

it("backstop", () => {
	// The client graph's rewrite drops the body, so the call there has no argument.
	const rewritten: () => unknown = Reflect.apply(createServerOnlyFn, undefined, [])
	expect(() => rewritten()).toThrow("A createServerOnlyFn function was called outside the server")
})
