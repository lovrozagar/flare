import { describe, expect, it } from "vitest"
import { findInsertionPoint } from "../../../src/add/chain-parser"

describe("findInsertionPoint", () => {
	it("finds insertion for head in a chain with render", () => {
		const source = `export const route = createPage("about")
	.render(() => <div>About</div>)
`
		const result = findInsertionPoint(source, "about", "head")
		expect(result).not.toBeNull()
		expect(result?.existingMethods).toContain("render")
		expect(result?.indent).toBe("\t")
	})

	it("inserts head before render (level 3 > level 1)", () => {
		const source = `export const route = createPage("about")
	.render(() => <div>About</div>)
`
		const result = findInsertionPoint(source, "about", "head")
		expect(result).not.toBeNull()
		/* head (L3) should insert before render (L1) */
		const before = source.slice(0, result?.insertOffset)
		expect(before).not.toContain(".render")
	})

	it("inserts loader before head (level 4 > level 3)", () => {
		const source = `export const route = createPage("about")
	.head(() => ({ title: "About" }))
	.render(() => <div>About</div>)
`
		const result = findInsertionPoint(source, "about", "loader")
		expect(result).not.toBeNull()
		const before = source.slice(0, result?.insertOffset)
		expect(before).not.toContain(".head")
	})

	it("inserts authenticate before loader (level 8 > level 4)", () => {
		const source = `export const route = createPage("dashboard")
	.loader(async () => ({}))
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "dashboard", "authenticate")
		expect(result).not.toBeNull()
		const before = source.slice(0, result?.insertOffset)
		expect(before).not.toContain(".loader")
	})

	it("inserts cache at the top (level 10)", () => {
		const source = `export const route = createPage("products")
	.authenticate()
	.loader(async () => ({}))
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "products", "cache")
		expect(result).not.toBeNull()
		const before = source.slice(0, result?.insertOffset)
		expect(before).not.toContain(".authenticate")
	})

	it("inserts errorRender after render (level 0 < level 1)", () => {
		const source = `export const route = createPage("about")
	.loader(async () => ({}))
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "about", "errorRender")
		expect(result).not.toBeNull()
		/* errorRender (L0) should go after all existing methods */
		const before = source.slice(0, result?.insertOffset)
		expect(before).toContain(".render")
	})

	it("returns null for duplicate method", () => {
		const source = `export const route = createPage("about")
	.head(() => ({ title: "About" }))
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "about", "head")
		expect(result).toBeNull()
	})

	it("returns null for non-matching virtualPath", () => {
		const source = `export const route = createPage("about")
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "contact", "head")
		expect(result).toBeNull()
	})

	it("handles multi-export files", () => {
		const source = `export const route = createPage("about")
	.render(() => <div>About</div>)

export const other = createPage("contact")
	.render(() => <div>Contact</div>)
`
		const result = findInsertionPoint(source, "contact", "head")
		expect(result).not.toBeNull()
		expect(result?.existingMethods).toContain("render")
	})

	it("detects tab indentation", () => {
		const source = `export const route = createPage("about")
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "about", "head")
		expect(result?.indent).toBe("\t")
	})

	it("handles chain with no existing methods", () => {
		const source = `export const route = createPage("about")
`
		const result = findInsertionPoint(source, "about", "render")
		expect(result).not.toBeNull()
		expect(result?.existingMethods).toHaveLength(0)
	})

	it("handles generic type parameters in builder", () => {
		const source = `export const route = createPage<{ id: string }>("products/[id]")
	.loader(async (ctx) => ({ item: null }))
	.render(() => <div />)
`
		const result = findInsertionPoint(source, "products/[id]", "head")
		expect(result).not.toBeNull()
	})

	it("preserves correct ordering for all 10 levels", () => {
		const source = `export const route = createPage("test")
	.cache({ ssg: true })
	.authenticate()
	.loader(async () => ({}))
	.head(() => ({ title: "Test" }))
	.render(() => <div />)
`
		/* effects (L6) should go between authenticate (L8) and loader (L4) */
		const result = findInsertionPoint(source, "test", "effects")
		expect(result).not.toBeNull()
		const before = source.slice(0, result?.insertOffset)
		expect(before).toContain(".authenticate")
		expect(before).not.toContain(".loader")
	})
})
