import { describe, expect, it } from "vitest"
import { formDataToObject } from "../../../src/server-fn/index.ts"

describe("formDataToObject", () => {
	/* F1: Single string values */
	it("F1: converts single string values", () => {
		const fd = new FormData()
		fd.append("email", "a@b.com")
		fd.append("name", "Jo")
		const result = formDataToObject(fd)
		expect(result).toEqual({ email: "a@b.com", name: "Jo" })
	})

	/* F2: Multiple same-name values → array */
	it("F2: converts multiple same-name values to array", () => {
		const fd = new FormData()
		fd.append("tag", "a")
		fd.append("tag", "b")
		fd.append("tag", "c")
		const result = formDataToObject(fd)
		expect(result).toEqual({ tag: ["a", "b", "c"] })
	})

	/* F3: File preserved */
	it("F3: preserves File instances", () => {
		const fd = new FormData()
		const file = new File(["hello"], "avatar.png", { type: "image/png" })
		fd.append("avatar", file)
		const result = formDataToObject(fd)
		expect(result.avatar).toBeInstanceOf(File)
		expect((result.avatar as File).name).toBe("avatar.png")
	})

	/* F4: Mixed string + file */
	it("F4: handles mixed string and file values", () => {
		const fd = new FormData()
		const file = new File(["data"], "photo.jpg", { type: "image/jpeg" })
		fd.append("name", "Jo")
		fd.append("avatar", file)
		const result = formDataToObject(fd)
		expect(result.name).toBe("Jo")
		expect(result.avatar).toBeInstanceOf(File)
	})

	/* F5: Strips __flare_fn */
	it("F5: strips __flare_fn key", () => {
		const fd = new FormData()
		fd.append("__flare_fn", "some-id")
		fd.append("email", "a@b.com")
		const result = formDataToObject(fd)
		expect(result).toEqual({ email: "a@b.com" })
		expect("__flare_fn" in result).toBe(false)
	})

	/* F6: Strips __proto__ */
	it("F6: strips __proto__ key", () => {
		const fd = new FormData()
		fd.append("__proto__", "x")
		const result = formDataToObject(fd)
		expect(Object.keys(result)).toEqual([])
	})

	/* F7: Strips constructor */
	it("F7: strips constructor key", () => {
		const fd = new FormData()
		fd.append("constructor", "x")
		const result = formDataToObject(fd)
		expect(Object.keys(result)).toEqual([])
	})

	/* F8: Strips prototype */
	it("F8: strips prototype key", () => {
		const fd = new FormData()
		fd.append("prototype", "x")
		const result = formDataToObject(fd)
		expect(Object.keys(result)).toEqual([])
	})

	/* F9: Empty FormData */
	it("F9: handles empty FormData", () => {
		const fd = new FormData()
		const result = formDataToObject(fd)
		expect(result).toEqual({})
		expect(Object.keys(result)).toEqual([])
	})

	/* F10: Empty string value preserved */
	it("F10: preserves empty string values", () => {
		const fd = new FormData()
		fd.append("name", "")
		const result = formDataToObject(fd)
		expect(result).toEqual({ name: "" })
	})

	/* extra: null prototype — no inherited properties */
	it("result has null prototype", () => {
		const fd = new FormData()
		fd.append("key", "val")
		const result = formDataToObject(fd)
		expect(Object.getPrototypeOf(result)).toBe(null)
	})
})
