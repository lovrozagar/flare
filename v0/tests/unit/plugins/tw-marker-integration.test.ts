/**
 * tw Marker Integration Tests
 *
 * End-to-end tests for transformTw: real Tailwind compiler, no mocks.
 * Covers the Anyrow landing regression (group marker dropped) and nested-rule
 * preservation, var() passthrough, dark: variant, and class= merging.
 *
 * Uses the test fixture CSS at tests/fixtures/tw-test.css which declares:
 *   @import "tailwindcss"
 *   @theme { --color-accent: #0070f3; }
 *   @custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
 */

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { clearTailwindCache, transformTw } from "../../../src/plugins/tailwind-transform/index"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const fixtureCss = resolve(__dirname, "../../fixtures/tw-test.css")

const opts = { css: fixtureCss }

/* Clear compiler + resolve cache between tests to avoid cross-test pollution */
afterEach(() => {
	clearTailwindCache()
})

describe("transformTw — Anyrow landing group regression", () => {
	it('tw="group ..." emits class="group" AND css= (not class only, not css only)', async () => {
		const input = `<a tw="group inline-flex">x</a>`
		const out = await transformTw(input, "test.tsx", opts)
		/* group must appear as a literal class on the element */
		expect(out).toContain('class="group"')
		/* inline-flex must be compiled to CSS */
		expect(out).toMatch(/css="[^"]+"/)
		/* css= must not contain "group" as a class name token — it's a marker, not a declaration */
		expect(out).not.toMatch(/css="[^"]*\bgroup\b[^"]*"/)
	})

	it('tw="group" alone emits only class="group", no empty css=""', async () => {
		const input = `<a tw="group">x</a>`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toContain('class="group"')
		/* No empty css attribute — would be stripped downstream but cleaner not to emit */
		expect(out).not.toContain('css=""')
	})

	it("existing class= merges with marker-derived class=", async () => {
		const input = `<a class="foo" tw="group inline-flex">x</a>`
		const out = await transformTw(input, "test.tsx", opts)
		/* Both foo and group must appear together in a single class= attr */
		expect(out).toMatch(/class="(?:foo group|group foo)"/)
		/* Must not have two separate class= attrs on the element */
		const classCount = (out.match(/class="/g) ?? []).length
		expect(classCount).toBe(1)
	})

	it('tw="peer ..." emits class="peer" AND css=', async () => {
		const input = `<input tw="peer block" />`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toContain('class="peer"')
		expect(out).toMatch(/css="[^"]+"/)
	})

	it('tw="group/item" named marker emits class="group/item"', async () => {
		const input = `<div tw="group/item flex">x</div>`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toContain('class="group/item"')
		expect(out).toMatch(/css="[^"]+"/)
	})
})

describe("transformTw — nested rule preservation", () => {
	it('tw="hover:bg-red-500" emits css= containing &:hover', async () => {
		const input = `<div tw="hover:bg-red-500">x</div>`
		const out = await transformTw(input, "test.tsx", opts)
		/* css attribute must contain the &:hover scoped rule */
		expect(out).toMatch(/css="[^"]*&:hover[^"]*"/)
	})

	it('tw="focus-visible:ring" emits css= containing &:focus-visible', async () => {
		const input = `<button tw="focus-visible:ring">x</button>`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toMatch(/css="[^"]*&:focus-visible[^"]*"/)
	})
})

describe("transformTw — var() passthrough (theme HMR)", () => {
	it('tw="bg-accent" emits css= containing var(--color-accent), not a baked literal', async () => {
		const input = `<div tw="bg-accent">x</div>`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toContain("var(--color-accent)")
		/* Must not contain the baked hex literal from resolveVars (which was deleted) */
		expect(out).not.toContain("#0070f3")
	})
})

describe("transformTw — dark: variant", () => {
	it('tw="dark:bg-black" emits css= containing [data-theme=dark] attribute selector', async () => {
		const input = `<div tw="dark:bg-black">x</div>`
		const out = await transformTw(input, "test.tsx", opts)
		/* With @custom-variant dark (&:where([data-theme=dark] ...)) in fixture, Tailwind compiles
		 * dark:X to [data-theme=dark] ancestor selector, not .dark class */
		expect(out).toContain("data-theme")
	})
})

describe("transformTw — no output for empty/marker-only input", () => {
	it("tw with only markers produces no css= attribute at all", async () => {
		const input = `<div tw="group peer">x</div>`
		const out = await transformTw(input, "test.tsx", opts)
		expect(out).toContain('class="group peer"')
		expect(out).not.toContain('css="')
	})
})
