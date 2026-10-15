import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { artifactPath } from "./artifact-path.ts"

const hex = (text: string): string => createHash("sha256").update(text).digest("hex")

it("about", async () => {
	expect(await artifactPath("static:b:_root_/about", { build: "b" })).toBe(
		`/assets/_flare-static/b/${hex("_root_/about")}.json`,
	)
})

it("params", async () => {
	expect(await artifactPath("static:b:home:042", { build: "b" })).toBe(
		`/assets/_flare-static/b/${hex("home:042")}.json`,
	)
})

// Two tails that differ only in case are two paths, so a case-insensitive file system writes two files.
it("case", async () => {
	const upper = await artifactPath("static:b:p:ABC", { build: "b" })
	const lower = await artifactPath("static:b:p:abc", { build: "b" })
	expect(upper).not.toBe(lower)
	expect(upper?.toLowerCase()).not.toBe(lower?.toLowerCase())
})

it("other build", async () => {
	expect(await artifactPath("static:other:home", { build: "b" })).toBeNull()
	expect(await artifactPath("epoch:t", { build: "b" })).toBeNull()
})

it("empty tail", async () => {
	expect(await artifactPath("static:b:", { build: "b" })).toBeNull()
})

// The tail is one hashed segment: no route id or param can climb out of the build directory.
it("one segment", async () => {
	for (const key of ["static:b:_root_/(blog)/post:a%2F..%2Fx", "static:b:..", "static:b:a/../../x"]) {
		const path = (await artifactPath(key, { build: "b", base: "/cdn/_flare-static" })) ?? ""
		expect(path).toMatch(/^\/cdn\/_flare-static\/b\/[0-9a-f]{64}\.json$/)
	}
})
