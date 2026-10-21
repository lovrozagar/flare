import { createComponent, createContext } from "solid-js"
import { render } from "@solidjs/web"
import { expect, it } from "vitest"
import { failOnUnhandled } from "./report-error.setup.ts"

const Context = createContext(0)

// A component that throws under a provider: Solid's dev build reports that throw through `reportError` as it
// rethrows it to the render's caller.
function mountThrowing(message: string): void {
	const Throws = (): never => {
		throw new Error(message)
	}
	const tree = () =>
		createComponent(Context, {
			value: 1,
			get children() {
				return createComponent(Throws, {})
			},
		})
	render(tree, document.createElement("div"))
}

// A listener that watches errors without preventing them, as a test's own spy would. With none, vitest itself raises
// the report as the run's unhandled error, which this file cannot observe and pass.
const watch = (): void => undefined

function watching(run: () => void): void {
	window.addEventListener("error", watch)
	try {
		run()
	} finally {
		window.removeEventListener("error", watch)
	}
}

// An unexpected render throw still fails the test that raised it: the report no listener prevented is the error the
// setup's afterEach throws (here called directly, so this case can see it).
it("unexpected render throw fails", () => {
	watching(() => expect(() => mountThrowing("unexpected")).toThrow("unexpected"))
	expect(failOnUnhandled).toThrow("unexpected")
	expect(failOnUnhandled).not.toThrow()
})

// Two reports unhandled in one test fail it with both.
it("every unhandled report", () => {
	watching(() => {
		expect(() => mountThrowing("first")).toThrow("first")
		expect(() => mountThrowing("second")).toThrow("second")
	})
	expect(failOnUnhandled).toThrow("2 errors reached reportError unhandled")
})

// A case that expects the throw prevents the event, and passes.
it("expected render throw passes", () => {
	const seen: string[] = []
	const expectThrow = (event: ErrorEvent): void => {
		event.preventDefault()
		seen.push(event.message)
	}
	window.addEventListener("error", expectThrow)
	expect(() => mountThrowing("expected")).toThrow("expected")
	window.removeEventListener("error", expectThrow)
	expect(seen).toEqual(["expected"])
	expect(failOnUnhandled).not.toThrow()
})
