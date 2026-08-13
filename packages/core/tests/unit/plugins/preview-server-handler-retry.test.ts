import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("Bug 79: preview server handler retries after import failure", () => {
	const devServerPath = join(__dirname, "../../../src/plugins/dev-server.ts")
	const source = readFileSync(devServerPath, "utf-8")

	it("getHandler() clears handlerPromise on rejection so next call retries", () => {
		/*
		 * If import() fails (corrupt build, file not ready), handlerPromise
		 * stays as a rejected promise. All subsequent requests return the
		 * same rejection because !handlerPromise is false.
		 *
		 * Fix: add .catch() that sets handlerPromise = undefined
		 */
		const previewSection = source.slice(source.indexOf("function createPreviewServerPlugin"))

		/* handlerPromise must have error recovery that clears itself */
		expect(previewSection).toMatch(/handlerPromise\.catch/)
		expect(previewSection).toMatch(/handlerPromise\s*=\s*undefined/)
	})

	it("handlerPromise is let (not const) to allow reassignment", () => {
		const previewSection = source.slice(source.indexOf("function createPreviewServerPlugin"))

		expect(previewSection).toMatch(/let\s+handlerPromise/)
	})
})
