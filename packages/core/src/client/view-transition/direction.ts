import type { TransitionDirection, TransitionInfo, ViewTransitionOptions } from "../../shared/router/create-router.ts";
import type { Location } from "../../shared/url/index.ts";

export type Direction = TransitionDirection;
export type { TransitionInfo, ViewTransitionOptions } from "../../shared/router/create-router.ts";

type Start = (options: { update: () => void; types: string[] }) => {
	updateCallbackDone: Promise<void>;
	ready: Promise<void>;
};

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

// The DOM update runs inside a view transition when one is on and the browser has the API. `types` defaults
// to the direction, and `false` from a types function skips the transition. Scope "auto" is the innermost
// `ViewTransitionBoundary` around the swapped outlet, and an element that cannot start one falls back to the
// document (dx/navigate.md).
export async function runTransition(input: {
	option: ViewTransitionOptions | false;
	info: TransitionInfo;
	auto: () => Element | Document;
	update: () => void;
}): Promise<void> {
	const { option, info } = input;
	if (option === false) return input.update();
	const types = typeof option.types === "function" ? option.types(info) : (option.types ?? [info.direction]);
	if (types === false) return input.update();
	const scope = typeof option.scope === "function" ? option.scope(info) : (option.scope ?? "auto");
	const start = starter(scope === "auto" ? input.auto() : document) ?? starter(document);
	if (start === undefined) return input.update();
	const transition = start({ update: input.update, types });
	// A skipped transition (an unload, a newer one, a hidden page) rejects `ready`. The update still runs (B17).
	transition.ready.catch(() => undefined);
	await transition.updateCallbackDone;
}

// Element-scoped transitions are newer than the document's, so both are read as a plain property.
function starter(scope: Element | Document): Start | undefined {
	const start: unknown = Reflect.get(scope, "startViewTransition");
	return typeof start === "function" ? (options) => Reflect.apply(start, scope, [options]) : undefined;
}
