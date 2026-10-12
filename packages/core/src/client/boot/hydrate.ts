import { createComponent } from "solid-js";
import type { JSX } from "@solidjs/web";
import { appTree, Matches } from "../../shared/components/index.ts";
import type { LinkPrefetch, NavigateTo } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { applyHeads } from "../head/index.ts";
import type { Blockers } from "../navigation/blocker.ts";
import type { NavigationState } from "../navigation/pending.ts";
import type { RouterStore, ScriptMatch } from "../router/store.ts";

// `build` is the deploy's id, written by the server once bit 12 lands. Until then it is absent, and an empty id
// disables the mismatch check on both sides (B7, B84).
// `fill` marks a stored document that left a `"stream"` hole: one fill follows hydrate (dx/defer.md).
export type ClientState = { matches: ScriptMatch[]; nonce: string; build?: string; fill?: boolean };

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

// The tree the server rendered, over the whole document: the same providers, then the matches, then the head
// (B91). The server's `_$HY` capture object stays as it is: hydrate reads it and replays the events it stored.
export function mountApp(app: App): () => void {
	const values = {
		router: app.router,
		location: () => app.store.snapshot().location,
		navigate: app.navigate,
		navigation: app.navigation,
		blockers: app.blockers,
		prefetcher: app.prefetcher,
		overlay: () => app.store.snapshot().overlay,
	};
	return app.mount(
		() =>
			appTree(values, () => [
				createComponent(Matches, { state: app.store.outlet }),
				createComponent(Heads, { store: app.store }),
			]),
		document,
	);
}

function Heads(props: { store: RouterStore }): JSX.Element {
	applyHeads(() => props.store.snapshot().heads);
	return undefined;
}
