/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { resolveFlareOptions, validateAssetsBase } from "../../../src/plugins/options.ts"

describe("resolveFlareOptions", () => {
	it("default-assets-base-is-/assets", () => {
		const result = resolveFlareOptions({})
		expect(result.assetsBase).toBe("/assets")
	})

	it("custom-assets-base-passes-through", () => {
		const result = resolveFlareOptions({ assetsBase: "/app/assets" })
		expect(result.assetsBase).toBe("/app/assets")
	})

	it("assets-base-rejects-trailing-slash", () => {
		expect(() => resolveFlareOptions({ assetsBase: "/app/assets/" })).toThrow()
	})

	it("assets-base-rejects-missing-leading-slash", () => {
		expect(() => resolveFlareOptions({ assetsBase: "app/assets" })).toThrow()
	})

	it("assets-base-rejects-query-or-hash", () => {
		expect(() => resolveFlareOptions({ assetsBase: "/app/assets?x=1" })).toThrow()
		expect(() => resolveFlareOptions({ assetsBase: "/app/assets#h" })).toThrow()
	})

	it("assets-base-rejects-empty-string", () => {
		expect(() => resolveFlareOptions({ assetsBase: "" })).toThrow()
	})

	it("assets-base-allows-root-slash", () => {
		const result = resolveFlareOptions({ assetsBase: "/" })
		expect(result.assetsBase).toBe("")
	})
})

describe("validateAssetsBase", () => {
	it("throws with message naming the option for trailing slash", () => {
		expect(() => validateAssetsBase("/app/assets/")).toThrow(/assetsBase/)
	})

	it("throws with message naming the option for missing leading slash", () => {
		expect(() => validateAssetsBase("app/assets")).toThrow(/assetsBase/)
	})

	it("throws with message naming the option for query string", () => {
		expect(() => validateAssetsBase("/app/assets?x=1")).toThrow(/assetsBase/)
	})

	it("throws with message naming the option for hash", () => {
		expect(() => validateAssetsBase("/app/assets#h")).toThrow(/assetsBase/)
	})

	it("throws with message naming the option for empty string", () => {
		expect(() => validateAssetsBase("")).toThrow(/assetsBase/)
	})

	it("normalizes root slash to empty string", () => {
		expect(validateAssetsBase("/")).toBe("")
	})
})
