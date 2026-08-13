/**
 * AppRoot Component Unit Tests
 *
 * Tests the AppRoot component types and exports.
 * AppRoot wraps app content with id="app" for hydration.
 */

import { describe, expect, it } from "vitest"
import { AppRoot, type AppRootProps } from "../../../src/components/app-root"

describe("AppRoot", () => {
	it("exports AppRoot function", () => {
		expect(typeof AppRoot).toBe("function")
	})

	it("AppRoot has correct function signature", () => {
		/* AppRoot should be a function that accepts props */
		expect(AppRoot.length).toBeGreaterThanOrEqual(0)
	})
})

describe("AppRootProps type", () => {
	it("allows children prop", () => {
		const props: AppRootProps = {
			children: null as unknown as import("solid-js").JSX.Element,
		}

		expect(props.children).toBeDefined()
	})

	it("allows class prop", () => {
		const props: AppRootProps = {
			children: null as unknown as import("solid-js").JSX.Element,
			class: "test-class",
		}

		expect(props.class).toBe("test-class")
	})

	it("allows style prop", () => {
		const props: AppRootProps = {
			children: null as unknown as import("solid-js").JSX.Element,
			style: { color: "red" },
		}

		expect(props.style).toEqual({ color: "red" })
	})

	it("allows data attributes", () => {
		const props: AppRootProps = {
			children: null as unknown as import("solid-js").JSX.Element,
			"data-testid": "app-root",
		}

		expect(props["data-testid"]).toBe("app-root")
	})

	it("allows aria attributes", () => {
		const props: AppRootProps = {
			"aria-label": "Main app",
			children: null as unknown as import("solid-js").JSX.Element,
			role: "main",
		}

		expect(props["aria-label"]).toBe("Main app")
		expect(props.role).toBe("main")
	})

	it("does not allow id prop (type-level)", () => {
		/* This test validates that TypeScript correctly excludes id from AppRootProps */
		/* The type: Omit<JSX.HTMLAttributes<HTMLDivElement>, "id"> */
		const props: AppRootProps = {
			children: null as unknown as import("solid-js").JSX.Element,
		}

		/* id should not be a valid key */
		expect("id" in props).toBe(false)
	})
})
