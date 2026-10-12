import { createComponent, type Context } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Matches, OverlayContext } from "../../shared/components/index.ts";
import {
	LocationContext,
	NavigateContext,
	PrefetchContext,
	RouterContext,
	type LinkPrefetch,
	type NavigateTo,
} from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { applyHeads } from "../head/index.ts";
import { BlockerContext, type Blockers } from "../navigation/blocker.ts";
import { NavigationContext, type NavigationState } from "../navigation/pending.ts";
import type { RouterStore, ScriptMatch } from "../router/store.ts";

export type ClientState = { matches: ScriptMatch[]; nonce: string };

// Solid's hydrate in the browser. A test passes a client render instead.
export type Mount = (code: () => JSX.Element, root: Document) => () => void;

export type App = {
	router: Router;
	store: RouterStore;
	navigation: NavigationState;
	blockers: Blockers;
	prefetcher: LinkPrefetch;
	navigate: (options: NavigateTo) => Promise<void>;
	mount: Mount;
};

export function readState(): ClientState {
	const script = [...document.querySelectorAll("script")].find((node) => node.textContent.includes("self.flare="));
	if (script === undefined) throw new Error("The document has no self.flare state script");
	const text = script.textContent;
	return JSON.parse(text.slice(text.indexOf("=") + 1));
}

// The providers, the head, and the matches, over the whole document. The server's `_$HY` capture object stays
// as it is: hydrate reads it and replays the events it stored (B91).
export function mountApp(app: App): () => void {
	const location = () => app.store.snapshot().location;
	const overlay = () => app.store.snapshot().overlay;
	return app.mount(
		() =>
			provider(RouterContext, app.router, () =>
				provider(LocationContext, location, () =>
					provider(NavigateContext, app.navigate, () =>
						provider(NavigationContext, app.navigation, () =>
							provider(BlockerContext, app.blockers, () =>
								provider(PrefetchContext, app.prefetcher, () =>
									provider(OverlayContext, overlay, () => [
										createComponent(Heads, { store: app.store }),
										createComponent(Matches, { state: app.store.outlet }),
									]),
								),
							),
						),
					),
				),
			),
		document,
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

function Heads(props: { store: RouterStore }): JSX.Element {
	applyHeads(() => props.store.snapshot().heads);
	return undefined;
}
