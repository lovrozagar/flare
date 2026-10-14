import type { TransitionDirection, TransitionInfo, ViewTransitionOptions } from "../../shared/router/create-router.ts";
import type { Location } from "../../shared/url/index.ts";

export type Direction = TransitionDirection;
export type { TransitionInfo, ViewTransitionOptions } from "../../shared/router/create-router.ts";

type Started = {
	updateCallbackDone: Promise<void>;
	ready: Promise<void>;
	finished: Promise<void>;
	skipTransition: () => void;
};

type Start = (arg: (() => void) | { update: () => void; types: string[] }) => Started;

// The page's navigation transition still running, skipped before the next one starts (B119). Client only: one page.
const transitions: { running: Started | undefined } = { running: undefined };

// The history index delta names the view-transition type. With transitions off there is none.
export function transitionDirection(input: { from: number; to: number; enabled: boolean }): Direction | undefined {
	return input.enabled ? stepDirection(input.from, input.to) : undefined;
}

// A step's direction from one history index to another.
export function stepDirection(from: number, to: number): Direction {
	if (to > from) return "forward";
	return to < from ? "back" : "same";
}

// What a scope or types function reads (dx/navigate.md).
export function transitionInfo(direction: Direction, from: Location, to: Location): TransitionInfo {
	return { direction, fromLocation: from, toLocation: to, pathChanged: from.pathname !== to.pathname };
}

// The navigate option wins over the router default. `true` is the defaults.
export function transitionOption(
	own: boolean | ViewTransitionOptions | undefined,
	router: false | ViewTransitionOptions,
): ViewTransitionOptions | false {
	if (own === undefined) return router;
	return own === true ? {} : own;
}

// The DOM update runs inside a view transition when one is on and the browser has the API (B119, v0's model). A
// transition still running is skipped first: two at once both freeze content being swapped. The start is the plain
// callback; the app's `types` go in the object form only where the browser supports them, and `false` from a types
// function skips the transition. The default scope is the document (B119 (5)). Scope "auto", an opt-in, is the
// innermost `ViewTransitionBoundary` around the swapped outlet, and an element that cannot start one, or whose start
// throws, falls back to the document (dx/navigate.md).
export async function runTransition(input: {
	option: ViewTransitionOptions | false;
	info: TransitionInfo;
	auto: () => Element | Document;
	update: () => void;
}): Promise<void> {
	const { option, info } = input;
	if (option === false) return input.update();
	const types = typeof option.types === "function" ? option.types(info) : (option.types ?? []);
	if (types === false) return input.update();
	const scope = typeof option.scope === "function" ? option.scope(info) : (option.scope ?? "document");
	const arg = types.length > 0 && typesSupported() ? { update: input.update, types } : input.update;
	const previous = transitions.running;
	transitions.running = undefined;
	previous?.skipTransition();
	const transition = begin(scope === "auto" ? input.auto() : document, arg);
	if (transition === undefined) return input.update();
	transitions.running = transition;
	const settled = (): void => {
		if (transitions.running === transition) transitions.running = undefined;
	};
	transition.finished.then(settled, settled);
	// A skipped transition (an unload, a newer one, a hidden page) rejects `ready`. The update still runs (B17).
	transition.ready.catch(() => undefined);
	await transition.updateCallbackDone;
}

// The scope's own start, else the document's. A scoped start that throws falls back to the document's (B119).
function begin(scope: Element | Document, arg: Parameters<Start>[0]): Started | undefined {
	const scoped = scope === document ? undefined : starter(scope);
	if (scoped !== undefined) {
		try {
			return scoped(arg);
		} catch {
			// An element that cannot start one now: the document's transition runs instead.
		}
	}
	return starter(document)?.(arg);
}

// A browser that supports view-transition types exposes their set's class.
function typesSupported(): boolean {
	return typeof Reflect.get(globalThis, "ViewTransitionTypeSet") === "function";
}

// Element-scoped transitions are newer than the document's, so both are read as a plain property.
function starter(scope: Element | Document): Start | undefined {
	const start: unknown = Reflect.get(scope, "startViewTransition");
	return typeof start === "function" ? (arg) => Reflect.apply(start, scope, [arg]) : undefined;
}
