import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import { Link } from "../../../src/link/index.tsx"
import { FlareProvider } from "../../../src/outlet/index.tsx"
import type { FlareProviderProps } from "../../../src/outlet/types.ts"
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts"
import type { TreeNode } from "../../../src/router-primitives/types.ts"

/* Mock navigation module */
vi.mock("../../../src/navigation", () => ({
	applyRewriteOutput: vi.fn((href: string) => href),
	hardNavigate: vi.fn(),
	isExternal: vi.fn((href: string) => {
		if (href.startsWith("mailto:") || href.startsWith("tel:")) return true
		if (href.startsWith("http://") || href.startsWith("https://")) {
			try {
				const url = new URL(href)
				return url.origin !== window.location.origin
			} catch {
				return false
			}
		}
		return false
	}),
	navigate: vi.fn(() => Promise.resolve()),
	prefetch: vi.fn(() => Promise.resolve()),
	resetNavigationState: vi.fn(),
	setupNavigation: vi.fn(),
}))

import { navigate } from "../../../src/navigation/index.ts"

const mockNavigate = navigate as ReturnType<typeof vi.fn>

function makeFakeTree(): TreeNode {
	return { s: {} }
}

function makeProviderProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		...overrides,
	}
}

describe("Link defaultPrevented", () => {
	let container: HTMLDivElement

	beforeEach(() => {
		mockNavigate.mockClear()
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		document.body.removeChild(container)
	})

	it("does NOT navigate when event.defaultPrevented is true", () => {
		const providerProps = makeProviderProps()

		render(
			() => (
				<FlareProvider {...providerProps}>
					<Link data-testid="prevented" to="/about">
						About
					</Link>
				</FlareProvider>
			),
			container,
		)

		const anchor = container.querySelector("[data-testid=prevented]") as HTMLAnchorElement
		expect(anchor).toBeTruthy()

		/* Simulate a parent handler that already prevented default */
		const event = new MouseEvent("click", { bubbles: true, cancelable: true })
		event.preventDefault()
		anchor.dispatchEvent(event)

		expect(mockNavigate).not.toHaveBeenCalled()
	})
})

describe("Link download attribute", () => {
	let container: HTMLDivElement

	beforeEach(() => {
		mockNavigate.mockClear()
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		document.body.removeChild(container)
	})

	it("click on <Link download> does NOT call navigate()", () => {
		const providerProps = makeProviderProps()

		render(
			() => (
				<FlareProvider {...providerProps}>
					<Link data-testid="dl" download="" to="/file.csv">
						Download
					</Link>
				</FlareProvider>
			),
			container,
		)

		const anchor = container.querySelector("[data-testid=dl]") as HTMLAnchorElement
		expect(anchor).toBeTruthy()
		expect(anchor.tagName.toLowerCase()).toBe("a")
		expect(anchor.hasAttribute("download")).toBe(true)

		anchor.click()

		expect(mockNavigate).not.toHaveBeenCalled()
	})

	it("click on <Link download='export.csv'> does NOT call navigate()", () => {
		const providerProps = makeProviderProps()

		render(
			() => (
				<FlareProvider {...providerProps}>
					<Link data-testid="dl-named" download="export.csv" to="/file.csv">
						Download Named
					</Link>
				</FlareProvider>
			),
			container,
		)

		const anchor = container.querySelector("[data-testid=dl-named]") as HTMLAnchorElement
		expect(anchor).toBeTruthy()
		expect(anchor.hasAttribute("download")).toBe(true)

		anchor.click()

		expect(mockNavigate).not.toHaveBeenCalled()
	})

	it("click on <Link> without download DOES call navigate() (regression guard)", () => {
		const providerProps = makeProviderProps()

		render(
			() => (
				<FlareProvider {...providerProps}>
					<Link data-testid="normal" to="/about">
						About
					</Link>
				</FlareProvider>
			),
			container,
		)

		const anchor = container.querySelector("[data-testid=normal]") as HTMLAnchorElement
		expect(anchor).toBeTruthy()

		anchor.click()

		expect(mockNavigate).toHaveBeenCalled()
	})
})
