import { createComponent, createContext, createMemo, untrack, useContext, type Context } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ChainRecord } from "../route-builder/chain.ts";
import type { Location } from "../url/index.ts";

type Raw = Record<string, string | string[]>;

// The page an intercepting navigation opened over the background (B84). `location` is the URL in the address
// bar. `background` is the page underneath, which stays mounted.
export type Overlay = {
	route: string;
	label: string;
	render?: ChainRecord["render"];
	data: unknown;
	params: Raw;
	search: Raw;
	preloader: Record<string, unknown>;
	location: Location;
	background: Location & { params: Raw };
};

// What the outlet child receives (dx/navigate.md).
export type InterceptState = {
	render: string;
	match: { loaderData: unknown; render: () => JSX.Element };
	params: Raw;
	search: Raw;
	backgroundLocation: Location & { params: Raw };
	dismiss: () => void;
};

// The browser provides the store's overlay. The server and a document load have none.
export const NO_OVERLAY = (): Overlay | undefined => undefined;

export const OverlayContext: Context<() => Overlay | undefined> = createContext<() => Overlay | undefined>(NO_OVERLAY);

// The layout owns it. With no overlay the child is not called. The page component runs only when the child
// calls `state.match.render`, and the target's layouts are not mounted here.
export function InterceptOutlet(props: { children: (state: InterceptState) => JSX.Element }): JSX.Element {
	const overlay = useContext(OverlayContext);
	const view = createMemo(() => {
		const current = overlay();
		return current === undefined ? undefined : untrack(() => props.children(stateOf(current)));
	});
	// JSX.Element types a reactive child only inside an array, the shape compiled JSX gives a fragment.
	return [view];
}

function stateOf(overlay: Overlay): InterceptState {
	const render = overlay.render;
	return {
		render: overlay.label,
		match: {
			loaderData: overlay.data,
			render: () =>
				render === undefined
					? undefined
					: createComponent(render, {
							loaderData: overlay.data,
							params: overlay.params,
							search: overlay.search,
							preloaderContext: overlay.preloader,
						}),
		},
		params: overlay.params,
		search: overlay.search,
		backgroundLocation: overlay.background,
		dismiss: () => history.back(),
	};
}
