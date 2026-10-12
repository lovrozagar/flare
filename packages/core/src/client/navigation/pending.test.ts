import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { expect, it } from "vitest";
import { createNavigationState, NavigationContext, useNavigation, type NavigationState } from "./pending.ts";

function mount(state: NavigationState): { pending: () => boolean } {
	const seen: { navigation?: { readonly pending: boolean } } = {};
	render(
		() =>
			createComponent(NavigationContext, {
				value: state,
				get children() {
					seen.navigation = useNavigation();
					return "";
				},
			}),
		document.createElement("div"),
	);
	return { pending: () => seen.navigation?.pending ?? false };
}

it("pending", async () => {
	const state = createNavigationState();
	const view = mount(state);
	const fetching = Promise.withResolvers<void>();
	const tracked = state.track(fetching.promise);
	flush();
	expect(view.pending()).toBe(true);
	fetching.resolve();
	await tracked;
});

it("settled", async () => {
	const state = createNavigationState();
	const view = mount(state);
	await state.track(Promise.resolve("done"));
	flush();
	expect(view.pending()).toBe(false);
	await state.track(Promise.reject(new Error("network"))).catch(() => undefined);
	flush();
	expect(view.pending()).toBe(false);
});
