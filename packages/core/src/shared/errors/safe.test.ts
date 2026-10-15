import { readFileSync } from "node:fs"
import * as web from "@solidjs/web"
import { expect, it } from "vitest"
import { markSafeError } from "./safe.ts"

it("delegates", () => {
	expect(markSafeError).toBe(web.markSafeError)
	expect(web.isSafeError(markSafeError(new Error("hi")))).toBe(true)
})

it("no local sanitize", () => {
	const source = readFileSync(new URL("safe.ts", import.meta.url), "utf8")
	expect(source).not.toMatch(/\bfunction\b|=>|\b(const|let|class)\b/)
})
