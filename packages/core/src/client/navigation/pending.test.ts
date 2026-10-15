import { createComponent, flush } from "solid-js"
import { render } from "@solidjs/web"
import { expect, it } from "vitest"
import { createNavigationState, NavigationContext, useNavigation, type NavigationState } from "./pending.ts"

function mount(state: NavigationState): { pending: () => boolean } {
	const seen: { navigation?: { readonly pending: boolean } } = {}
	render(
		() =>
			createComponent(NavigationContext, {
				value: state,
				get children() {
					seen.navigation = useNavigation()
					return ""
				},
			}),
		document.createElement("div"),
	)
	return { pending: () => seen.navigation?.pending ?? false }
}

it("pending", () => {
	const state = createNavigationState()
	const view = mount(state)
	const end = state.begin()
	flush()
	expect(view.pending()).toBe(true)
	end()
	flush()
	expect(view.pending()).toBe(false)
})

// A navigation's end counts once however often it is called, so a second navigation still in flight keeps pending true
// until its own end (B124).
it("settled", () => {
	const state = createNavigationState()
	const view = mount(state)
	const first = state.begin()
	const second = state.begin()
	first()
	first()
	flush()
	expect(view.pending()).toBe(true)
	second()
	flush()
	expect(view.pending()).toBe(false)
})
