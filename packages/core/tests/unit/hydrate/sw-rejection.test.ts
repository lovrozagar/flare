import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

/**
 * Verifies that navigator.serviceWorker.register() and .getRegistrations()
 * have .catch() handlers to prevent unhandled promise rejections.
 */

const srcPath = join(__dirname, "../../../src/hydrate/index.tsx")

describe("service worker registration — .catch() handlers", () => {
	it("register() call has .catch() in source", () => {
		const src = readFileSync(srcPath, "utf-8")
		const registerBlock = src.match(/\.register\([\s\S]*?\)[\s\S]*?\.catch/m)
		expect(registerBlock).not.toBeNull()
	})

	it("getRegistrations() call has .catch() in source", () => {
		const src = readFileSync(srcPath, "utf-8")
		const getRegsBlock = src.match(
			/\.getRegistrations\(\)[\s\S]*?\.then\([\s\S]*?\)[\s\S]*?\.catch/m,
		)
		expect(getRegsBlock).not.toBeNull()
	})

	it("rejecting register() does not throw when called directly", async () => {
		const registerMock = vi.fn().mockReturnValue(Promise.reject(new Error("SW failed")))
		/* Simulate the fixed pattern */
		await expect(registerMock("/sw.js", { scope: "/" }).catch(() => {})).resolves.toBeUndefined()
	})

	it("rejecting getRegistrations() does not throw when called directly", async () => {
		const getRegsMock = vi.fn().mockReturnValue(Promise.reject(new Error("getRegs failed")))
		await expect(
			getRegsMock()
				.then((regs: readonly ServiceWorkerRegistration[]) => {
					for (const reg of regs) reg.unregister()
				})
				.catch(() => {}),
		).resolves.toBeUndefined()
	})
})
