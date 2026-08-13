import { createRoot, type JSX } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	ResetCSS,
	SSRContextProvider,
	type SSRContextValue,
	ViewTransitionCSS,
} from "../../../src/components/index.ts"
import {
	DevErrorOverlay,
	getDevErrorStore,
	resetDevErrorStore,
} from "../../../src/components/dev-error-overlay.tsx"
import { getDirectionScript } from "../../../src/direction.ts"
import { getThemeScript } from "../../../src/theme.ts"

function makeSSRContext(overrides?: Partial<SSRContextValue>): SSRContextValue {
	return {
		flareStateScript: "<script>window.__FLARE__={}</script>",
		isServer: true,
		nonce: "test-nonce",
		...overrides,
	}
}

function renderWithSSR(
	ctx: SSRContextValue,
	component: () => JSX.Element,
): { container: HTMLDivElement; dispose: () => void } {
	const container = document.createElement("div")
	document.body.appendChild(container)
	let dispose: () => void = () => {}

	createRoot((d) => {
		dispose = d
		render(() => <SSRContextProvider value={ctx}>{component()}</SSRContextProvider>, container)
	})

	return { container, dispose }
}

/* ── ThemeScript ─────────────────────────────────────────────────────── */

describe("ThemeScript", () => {
	/*
	 * ThemeScript renders a <script innerHTML={...}> that jsdom tries to evaluate.
	 * The inline JS calls matchMedia which jsdom lacks. Test the utility directly
	 * since the component is a thin wrapper.
	 */
	it("getThemeScript returns non-empty script", () => {
		const script = getThemeScript()
		expect(script.length).toBeGreaterThan(0)
		expect(script).toContain("localStorage")
	})

	it("getThemeScript respects custom storageKey", () => {
		const script = getThemeScript({ storageKey: "my-theme" })
		expect(script).toContain("my-theme")
	})

	it("getThemeScript respects custom attribute", () => {
		const script = getThemeScript({ attribute: "class" })
		expect(script).toContain("class")
	})
})

/* ── DirectionScript ─────────────────────────────────────────────────── */

describe("DirectionScript", () => {
	/* Same jsdom limitation as ThemeScript — test utility directly */
	it("getDirectionScript returns non-empty script", () => {
		const script = getDirectionScript()
		expect(script.length).toBeGreaterThan(0)
		expect(script).toContain("localStorage")
	})

	it("getDirectionScript respects custom storageKey", () => {
		const script = getDirectionScript({ storageKey: "my-dir" })
		expect(script).toContain("my-dir")
	})
})

/* ── ResetCSS ────────────────────────────────────────────────────────── */

describe("ResetCSS", () => {
	let container: HTMLDivElement
	let dispose: () => void

	afterEach(() => {
		dispose?.()
		container?.remove()
	})

	it("renders style tag with reset CSS", () => {
		const ctx = makeSSRContext()
		const result = renderWithSSR(ctx, () => <ResetCSS />)
		container = result.container
		dispose = result.dispose

		const style = container.querySelector("style")
		expect(style).not.toBeNull()
		expect(style?.innerHTML).toContain("box-sizing")
	})

	it("nonce applied to style tag", () => {
		const ctx = makeSSRContext({ nonce: "css-nonce" })
		const result = renderWithSSR(ctx, () => <ResetCSS />)
		container = result.container
		dispose = result.dispose

		const style = container.querySelector("style")
		expect(style?.getAttribute("nonce")).toBe("css-nonce")
	})
})

/* ── ViewTransitionCSS ───────────────────────────────────────────────── */

describe("ViewTransitionCSS", () => {
	let container: HTMLDivElement
	let dispose: () => void

	afterEach(() => {
		dispose?.()
		container?.remove()
	})

	it("renders style tag with default view transition CSS", () => {
		const ctx = makeSSRContext()
		const result = renderWithSSR(ctx, () => <ViewTransitionCSS />)
		container = result.container
		dispose = result.dispose

		const style = container.querySelector("style")
		expect(style).not.toBeNull()
		expect(style?.innerHTML).toContain("@view-transition")
		expect(style?.innerHTML).toContain("175ms")
	})

	it("custom duration", () => {
		const ctx = makeSSRContext()
		const result = renderWithSSR(ctx, () => <ViewTransitionCSS duration={300} />)
		container = result.container
		dispose = result.dispose

		const style = container.querySelector("style")
		expect(style?.innerHTML).toContain("300ms")
		expect(style?.innerHTML).not.toContain("175ms")
	})

	it("nonce applied", () => {
		const ctx = makeSSRContext({ nonce: "vt-nonce" })
		const result = renderWithSSR(ctx, () => <ViewTransitionCSS />)
		container = result.container
		dispose = result.dispose

		const style = container.querySelector("style")
		expect(style?.getAttribute("nonce")).toBe("vt-nonce")
	})
})

/* ── DevErrorOverlay ─────────────────────────────────────────────────── */

describe("DevErrorOverlay", () => {
	let container: HTMLDivElement
	let dispose: () => void

	beforeEach(() => {
		resetDevErrorStore()
	})

	afterEach(() => {
		dispose?.()
		container?.remove()
		/* Clean up Portal-rendered overlays */
		for (const el of document.querySelectorAll("[data-flare-dev-overlay]")) {
			el.parentElement?.remove()
		}
		resetDevErrorStore()
	})

	it("no errors → nothing rendered", () => {
		container = document.createElement("div")
		document.body.appendChild(container)
		createRoot((d) => {
			dispose = d
			render(() => <DevErrorOverlay />, container)
		})

		expect(document.querySelector("[data-flare-dev-overlay]")).toBeNull()
	})

	it("with errors → overlay rendered", () => {
		const store = getDevErrorStore()
		store.register(new Error("test error"), "test")

		container = document.createElement("div")
		document.body.appendChild(container)
		createRoot((d) => {
			dispose = d
			render(() => <DevErrorOverlay />, container)
		})

		const overlay = document.querySelector("[data-flare-dev-overlay]")
		expect(overlay).not.toBeNull()
		expect(overlay?.textContent).toContain("test error")
	})

	it("displays error count", () => {
		const store = getDevErrorStore()
		store.register(new Error("err1"), "test")
		store.register(new Error("err2"), "test")

		container = document.createElement("div")
		document.body.appendChild(container)
		createRoot((d) => {
			dispose = d
			render(() => <DevErrorOverlay />, container)
		})

		const overlay = document.querySelector("[data-flare-dev-overlay]")
		expect(overlay?.textContent).toContain("2 errors")
	})

	it("singular error label", () => {
		const store = getDevErrorStore()
		store.register(new Error("single"), "test")

		container = document.createElement("div")
		document.body.appendChild(container)
		createRoot((d) => {
			dispose = d
			render(() => <DevErrorOverlay />, container)
		})

		const overlay = document.querySelector("[data-flare-dev-overlay]")
		expect(overlay?.textContent).toContain("1 error")
		expect(overlay?.textContent).not.toContain("1 errors")
	})

	it("getDevErrorStore returns singleton", () => {
		const a = getDevErrorStore()
		const b = getDevErrorStore()
		expect(a).toBe(b)
	})

	it("resetDevErrorStore creates new instance", () => {
		const a = getDevErrorStore()
		a.register(new Error("old"), "test")
		resetDevErrorStore()
		const b = getDevErrorStore()
		expect(b.errors()).toHaveLength(0)
	})
})
