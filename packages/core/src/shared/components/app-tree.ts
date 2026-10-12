import { createComponent, type Context } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
	BlockerContext,
	LocationContext,
	NavigateContext,
	NavigationContext,
	PrefetchContext,
	RouterContext,
	type Blockers,
	type LinkPrefetch,
	type NavigateTo,
	type NavigationState,
} from "../router/context.ts";
import type { Router } from "../router/create-router.ts";
import type { Location } from "../url/index.ts";
import { OverlayContext, type Overlay } from "./intercept-outlet.tsx";

// What one render provides. The server passes its request's values and the browser passes its own.
export type AppValues = {
	router: Router;
	location: () => Location;
	navigate: ((options: NavigateTo) => Promise<void>) | null;
	navigation: NavigationState;
	blockers: Blockers;
	prefetcher: LinkPrefetch | null;
	overlay: () => Overlay | undefined;
};

// The server and the client render this same tree. Solid derives hydration keys from it, so each side has the
// same providers in the same order, whatever their values (B91).
export function appTree(values: AppValues, children: () => JSX.Element): JSX.Element {
	return provider(RouterContext, values.router, () =>
		provider(LocationContext, values.location, () =>
			provider(NavigateContext, values.navigate, () =>
				provider(NavigationContext, values.navigation, () =>
					provider(BlockerContext, values.blockers, () =>
						provider(PrefetchContext, values.prefetcher, () => provider(OverlayContext, values.overlay, children)),
					),
				),
			),
		),
	);
}

function provider<T>(context: Context<T>, value: T, children: () => JSX.Element): JSX.Element {
	return createComponent(context, {
		value,
		get children() {
			return children();
		},
	});
}
