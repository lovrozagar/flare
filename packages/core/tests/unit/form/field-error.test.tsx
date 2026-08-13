import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, describe, expect, it } from "vitest"
import { FieldError, type FormContext } from "../../../src/form/index.tsx"

/* ── helpers ───────────────────────────────────────────────────────── */

function createFormContext(fieldErrors: Record<string, string[]> = {}): FormContext<unknown> {
	const [fe, setFe] = createSignal(fieldErrors)
	return {
		error: () => null,
		fieldErrors: fe,
		hasErrors: () => Object.keys(fe()).length > 0,
		pending: () => false,
		reset: () => setFe({}),
		result: () => undefined,
		value: () => "",
	}
}

let container: HTMLDivElement

function setup(): void {
	container = document.createElement("div")
	document.body.appendChild(container)
}

afterEach(() => {
	if (container) {
		container.remove()
	}
})

/* ── FE1–FE6 ──────────────────────────────────────────────────────── */

describe("FieldError component", () => {
	/* FE1: No error */
	it("FE1: renders nothing when no errors exist", () => {
		setup()
		const form = createFormContext({})
		render(() => <FieldError field="email" of={form} />, container)
		expect(container.innerHTML).toBe("")
	})

	/* FE2: Has error */
	it("FE2: renders first error message", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError field="email" of={form} />, container)
		const el = container.querySelector("p")
		expect(el).toBeTruthy()
		expect(el?.textContent).toBe("Required")
	})

	/* FE3: Multiple errors — shows first */
	it("FE3: renders only first error when multiple exist", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid format"] })
		render(() => <FieldError field="email" of={form} />, container)
		const el = container.querySelector("p")
		expect(el?.textContent).toBe("Required")
		/* Only one element rendered */
		expect(container.querySelectorAll("p").length).toBe(1)
	})

	/* FE4: Custom as */
	it("FE4: renders custom element tag via as prop", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError as="span" field="email" of={form} />, container)
		const span = container.querySelector("span")
		expect(span).toBeTruthy()
		expect(span?.textContent).toBe("Required")
		expect(container.querySelector("p")).toBeNull()
	})

	/* FE5: Custom class */
	it("FE5: applies class attribute", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError class="text-red" field="email" of={form} />, container)
		const el = container.querySelector("p")
		expect(el?.getAttribute("class")).toBe("text-red")
	})

	/* FE6: Wrong field name */
	it("FE6: renders nothing for non-matching field name", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError field="name" of={form} />, container)
		expect(container.innerHTML).toBe("")
	})

	/* ── FE7–FE14: all prop ───────────────────────────────────────────── */

	/* FE7: all not set, single error — renders one element (baseline) */
	it("FE7: without all prop, single error renders one element", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError field="email" of={form} />, container)
		expect(container.querySelectorAll("p").length).toBe(1)
		expect(container.querySelector("p")?.textContent).toBe("Required")
	})

	/* FE8: all not set, multiple errors — renders only first */
	it("FE8: without all prop, multiple errors renders only first", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid format", "Too short"] })
		render(() => <FieldError field="email" of={form} />, container)
		expect(container.querySelectorAll("p").length).toBe(1)
		expect(container.querySelector("p")?.textContent).toBe("Required")
	})

	/* FE9: all=true, single error — renders one element */
	it("FE9: all prop with single error renders one element", () => {
		setup()
		const form = createFormContext({ email: ["Required"] })
		render(() => <FieldError all field="email" of={form} />, container)
		expect(container.querySelectorAll("p").length).toBe(1)
		expect(container.querySelector("p")?.textContent).toBe("Required")
	})

	/* FE10: all=true, multiple errors — renders all in separate elements */
	it("FE10: all prop with multiple errors renders all errors", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid format", "Too short"] })
		render(() => <FieldError all field="email" of={form} />, container)
		const ps = container.querySelectorAll("p")
		expect(ps.length).toBe(3)
		expect(ps[0]?.textContent).toBe("Required")
		expect(ps[1]?.textContent).toBe("Invalid format")
		expect(ps[2]?.textContent).toBe("Too short")
	})

	/* FE11: all=true, no errors — renders nothing */
	it("FE11: all prop with no errors renders nothing", () => {
		setup()
		const form = createFormContext({})
		render(() => <FieldError all field="email" of={form} />, container)
		expect(container.innerHTML).toBe("")
	})

	/* FE12: all=true + custom as — each element uses custom tag */
	it("FE12: all prop with custom as renders each error in custom element", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid format"] })
		render(() => <FieldError all as="span" field="email" of={form} />, container)
		const spans = container.querySelectorAll("span")
		expect(spans.length).toBe(2)
		expect(spans[0]?.textContent).toBe("Required")
		expect(spans[1]?.textContent).toBe("Invalid format")
		expect(container.querySelector("p")).toBeNull()
	})

	/* FE13: all=true + custom class — each element has class */
	it("FE13: all prop applies class to each error element", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid format"] })
		render(() => <FieldError all class="err" field="email" of={form} />, container)
		const ps = container.querySelectorAll("p")
		expect(ps.length).toBe(2)
		expect(ps[0]?.getAttribute("class")).toBe("err")
		expect(ps[1]?.getAttribute("class")).toBe("err")
	})

	/* FE14: all=true, wrong field — renders nothing */
	it("FE14: all prop with non-matching field renders nothing", () => {
		setup()
		const form = createFormContext({ email: ["Required", "Invalid"] })
		render(() => <FieldError all field="name" of={form} />, container)
		expect(container.innerHTML).toBe("")
	})
})
