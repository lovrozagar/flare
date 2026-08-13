import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import { NavigationProgress } from "../../../src/navigation-progress/index.tsx"
import { RouterContext } from "../../../src/outlet/index.tsx"
import type { FlareProviderContext, NavigationPhase } from "../../../src/outlet/types.ts"

function makeCtx(phaseSignal: () => NavigationPhase): FlareProviderContext {
	return {
		hydrated: () => true,
		intercepted: () => null,
		invalidate: vi.fn(),
		isNavigating: () => phaseSignal() !== "idle",
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/",
			search: {},
			url: new URL("http://localhost/"),
			variablePath: "/",
			virtualPath: "_root_/",
		}),
		matchCache: createMatchCache(),
		matches: () => [],
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: phaseSignal,
		notFound: () => false,
		params: () => ({}),
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: { s: {} },
		search: () => ({}),
		setHydrated: vi.fn(),
		setIntercepted: vi.fn(),
		setMatches: vi.fn(),
		setNavigationPhase: vi.fn(),
		setNotFound: vi.fn(),
		setParams: vi.fn(),
		setSearch: vi.fn(),
		setViewTransition: vi.fn(),
		viewTransition: () => null,
	}
}

/**
 * Extract translate3d percentage from transform string.
 * translate3d(-92%,0,0) → -92, translate3d(0%,0,0) → 0
 */
function parseTranslatePercent(transform: string): number {
	const match = transform.match(/translate3d\(([^%]+)%/)
	if (!match) return Number.NaN
	return parseFloat(match[1] ?? "NaN")
}

describe("NavigationProgress", () => {
	let container: HTMLDivElement

	beforeEach(() => {
		vi.useFakeTimers()
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		vi.useRealTimers()
		container.remove()
	})

	it("renders element with role=progressbar and aria attributes", () => {
		const ctx = makeCtx(() => "idle")

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		const bar = container.querySelector("[role=progressbar]")
		expect(bar).not.toBeNull()
		expect(bar?.getAttribute("aria-valuemin")).toBe("0")
		expect(bar?.getAttribute("aria-valuemax")).toBe("100")
	})

	it("bar hidden when idle (translate at -100%)", () => {
		const ctx = makeCtx(() => "idle")

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		expect(parseTranslatePercent(bar.style.transform)).toBe(-100)
	})

	it("bar appears on loading (wrapper visible, translate > -100%)", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(250)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		const wrapper = bar.parentElement as HTMLElement
		expect(wrapper.style.opacity).toBe("1")
		expect(parseTranslatePercent(bar.style.transform)).toBeGreaterThan(-100)
	})

	it("trickle increases progress over time", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(200)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		const first = parseTranslatePercent(bar.style.transform)

		vi.advanceTimersByTime(600)
		const second = parseTranslatePercent(bar.style.transform)
		/* translate3d moves from -100% toward 0%, so "greater" means more progress */
		expect(second).toBeGreaterThan(first)
		expect(second).toBeLessThanOrEqual(-10)
	})

	it("bar completes to translate3d(0%,0,0) when leaving loading", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(400)

		setPhase("idle")
		vi.advanceTimersByTime(10)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		expect(parseTranslatePercent(bar.style.transform)).toBe(0)
	})

	it("wrapper fades out after completion", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(400)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		const wrapper = bar.parentElement as HTMLElement

		setPhase("idle")
		vi.advanceTimersByTime(10)

		/* Immediately after set(1): wrapper snapped to opacity 1 */
		expect(wrapper.style.opacity).toBe("1")
		expect(parseTranslatePercent(bar.style.transform)).toBe(0)

		/* After speed(200)ms: wrapper fades to opacity 0 */
		vi.advanceTimersByTime(200)
		expect(wrapper.style.opacity).toBe("0")
	})

	it("custom color/height/zIndex props applied", () => {
		const ctx = makeCtx(() => "idle")

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress color="#ff0000" height={4} zIndex={1000} />
				</RouterContext.Provider>
			),
			container,
		)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		expect(bar.style.backgroundColor).toBe("rgb(255, 0, 0)")

		/* height and zIndex are on the wrapper div */
		const wrapper = bar.parentElement as HTMLElement
		expect(wrapper.style.height).toBe("4px")
		expect(wrapper.style.zIndex).toBe("1000")
	})

	it("minDisplayTime prevents flicker (fast loading→idle keeps bar visible)", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress minDisplayTime={150} />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(50)

		/* Navigation completes very fast (50ms < 150ms minDisplayTime) */
		setPhase("idle")
		vi.advanceTimersByTime(10)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		const wrapper = bar.parentElement as HTMLElement
		/* Bar should still be visible, not yet completed */
		expect(wrapper.style.opacity).toBe("1")

		/* After remaining minDisplayTime elapses, bar completes */
		vi.advanceTimersByTime(150)
		expect(parseTranslatePercent(bar.style.transform)).toBe(0)
	})

	it("cleanup clears intervals on unmount", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		const dispose = render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		setPhase("loading")
		vi.advanceTimersByTime(200)

		const timersBefore = vi.getTimerCount()
		dispose()
		const timersAfter = vi.getTimerCount()

		expect(timersAfter).toBeLessThan(timersBefore)
	})

	it("re-entering loading after completion restarts", () => {
		const [phase, setPhase] = createSignal<NavigationPhase>("idle")
		const ctx = makeCtx(phase)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<NavigationProgress />
				</RouterContext.Provider>
			),
			container,
		)

		/* First navigation */
		setPhase("loading")
		vi.advanceTimersByTime(400)
		setPhase("idle")
		/* Let full completion: set(1) + fade(200) + reset(200) */
		vi.advanceTimersByTime(500)

		const bar = container.querySelector("[role=progressbar]") as HTMLElement
		/* After full reset, bar at -100% */
		expect(parseTranslatePercent(bar.style.transform)).toBe(-100)

		/* Second navigation — should restart from beginning */
		setPhase("loading")
		vi.advanceTimersByTime(200)

		const wrapper = bar.parentElement as HTMLElement
		expect(wrapper.style.opacity).toBe("1")
		const pct = parseTranslatePercent(bar.style.transform)
		/* Should be near start (close to -100%), not at 0% from previous nav */
		expect(pct).toBeLessThan(-50)
	})
})
