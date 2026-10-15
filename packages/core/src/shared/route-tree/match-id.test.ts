import { expect, it } from "vitest"
import { matchId } from "./match-id.ts"

it("raw both sides", () => {
	const id = matchId({ id: "042" }, "a=1")
	expect(id).toContain("042")
	expect(id).toContain("a=1")
	expect(id).not.toBe("id=42&a=1")
})

it("same id", () => {
	const server = matchId({ id: "042" }, "a=1")
	const client = matchId({ id: "042" }, "a=1")
	expect(server).toBe(client)
	expect(typeof server).toBe("string")
})

it("catch-all", () => {
	expect(matchId({ path: ["a", "b%20c"] }, "")).toBe(matchId({ path: "a/b%20c" }, ""))
	expect(matchId({ path: ["a", "b%20c"] }, "")).toContain("path=a/b%20c")
})
