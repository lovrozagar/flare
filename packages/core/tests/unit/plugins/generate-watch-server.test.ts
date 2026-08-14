import { describe, expect, it, vi } from "vitest"
import { safeRunGenerate } from "../../../src/plugins/generate-watch.ts"

vi.mock("../../../src/generators/index.ts", () => ({
	runGenerate: vi.fn(),
}))

const { runGenerate } = await import("../../../src/generators/index.ts")

describe("safeRunGenerate", () => {
	it("forwards options to runGenerate", () => {
		vi.mocked(runGenerate).mockReturnValueOnce({ layouts: 1, routes: 2, warnings: [] })
		safeRunGenerate({ fsCodegen: true, rootDir: "/app" })
		expect(runGenerate).toHaveBeenCalledWith({ fsCodegen: true, rootDir: "/app" })
	})

	it("logs and does not throw when generate fails", () => {
		vi.mocked(runGenerate).mockImplementationOnce(() => {
			throw new Error("fsVirtualPaths is enabled\n  - src/routes/about.tsx")
		})
		const errors: string[] = []
		const orig = console.error
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "))
		}
		try {
			expect(() => safeRunGenerate({ fsCodegen: true, rootDir: "/app" })).not.toThrow()
		} finally {
			console.error = orig
		}
		expect(errors.some((e) => e.includes("[flare:generate]") && e.includes("about.tsx"))).toBe(true)
	})
})
