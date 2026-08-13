/** @vitest-environment node */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const srcPath = join(__dirname, "../../../src/ssr/index.tsx")

describe("SSR stream reader lock release", () => {
	it("reader.releaseLock() in finally block after stream processing", () => {
		const src = readFileSync(srcPath, "utf-8")
		/* Verify the try block has a finally with releaseLock */
		const finallyBlock = src.match(/}\s*finally\s*\{[^}]*reader\.releaseLock\(\)/m)
		expect(finallyBlock).not.toBeNull()
	})

	it("buffer overflow path also calls reader.releaseLock()", () => {
		const src = readFileSync(srcPath, "utf-8")
		/* The buffer limit abort path should release the lock */
		const bufferAbortSection = src.match(
			/stream buffer limit exceeded[\s\S]*?reader\.releaseLock\(\)/m,
		)
		expect(bufferAbortSection).not.toBeNull()
	})
})
