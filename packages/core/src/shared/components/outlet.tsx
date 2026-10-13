import { defined } from "../errors/index.ts";
import { createComponent, createContext, createMemo, Errored, merge, onCleanup, untrack, useContext } from "solid-js";
import { Dynamic, isServer, type JSX } from "@solidjs/web";
import type { ChainRecord, Render } from "../route-builder/chain.ts";
import type { BoundaryRecord, Located, NotFoundRender } from "../route-builder/index.ts";
import { LocationContext, NavigateContext, useRouter } from "../router/context.ts";
import { readSearch } from "../url/index.ts";
import { boundaryAt, boundaryFallback, boundaryKind, boundaryReset } from "./boundary.ts";
import { MatchesContext, rawParams } from "./outlet-nodes.ts";
import { TransitionScopeContext } from "./view-transition-boundary.tsx";

// `preloader` is the preloader context accumulated through this match. Absent is `{}`.
export type OutletMatch = Located & {
	id: string;
	kind: "layout" | "page" | "segment";
	module: { render?: ChainRecord["render"]; boundaries?: BoundaryRecord };
	data: unknown;
	preloader?: Record<string, unknown>;
};

// `failure.index` is the root-most failed match. `unknown` is an unknown URL: the slot after the last layout
// paints the not-found the router chose (B77). A boundary function that throws is reported, then skipped.
export type OutletState = {
	matches: readonly OutletMatch[];
	failure?: { index: number; status: number; error: Error } | undefined;
	unknown?: { render?: NotFoundRender | undefined } | undefined;
	onBoundaryError: (error: unknown) => void;
	// The server records a render throw here and answers it as a status (B93).
	failRender?: ((error: unknown) => void) | undefined;
	// The browser keeps each slot's view-transition scope, the innermost boundary around that outlet.
	onSlot?: (depth: number, scope: () => Element | undefined) => () => void;
};

const NONE: BoundaryRecord = {};

type Slot = { state: () => OutletState; depth: number };

const SlotContext = createContext<Slot>();

export function Outlet(): JSX.Element {
	const slot = useContext(SlotContext);
	return renderSlot(slot.state, slot.depth);
}

export function Matches(props: { state: () => OutletState }): JSX.Element {
	return createComponent(MatchesContext, {
		value: props.state,
		get children() {
			return renderSlot(props.state, 0);
		},
	});
}

// A slot remounts only when its key changes: a new match id at that depth, or a failure painted there. A loader
// refresh keeps the key, so the component stays and reads the new data.
function renderSlot(state: () => OutletState, depth: number): JSX.Element {
	const key = createMemo(() => slotKey(state(), depth));
	const slot = createMemo(() => {
		key();
		return untrack(() => paintSlot(state, depth));
	});
	const unregister = untrack(state).onSlot?.(depth, useContext(TransitionScopeContext));
	if (unregister !== undefined) onCleanup(unregister);
	// JSX.Element types a reactive child only inside an array, the shape compiled JSX gives a fragment.
	return [slot];
}

function slotKey(state: OutletState, depth: number): string {
	if (state.failure?.index === depth) return `!${state.failure.status}`;
	return state.matches[depth]?.id ?? (state.unknown === undefined ? "" : "?");
}

function paintSlot(state: () => OutletState, depth: number): JSX.Element {
	const current = state();
	if (current.failure?.index === depth) return paintFailure(current, current.failure);
	const match = current.matches[depth];
	if (match !== undefined) return renderMatch(state, depth, match);
	if (current.unknown === undefined) return undefined;
	const owner = defined(current.matches[depth - 1], "the not-found owner");
	const notFound = current.unknown.render;
	if (notFound === undefined) return builtin(404);
	return notFound({ params: owner.params, search: owner.search });
}

function renderMatch(state: () => OutletState, depth: number, match: OutletMatch): JSX.Element {
	const render = match.module.render;
	// A match with no render passes its slot through, as a segment does.
	if (render === undefined) return renderSlot(state, depth + 1);
	return createComponent(SlotContext, {
		value: { state, depth: depth + 1 },
		// The provider reads its children in a tracked scope. createComponent untracks the route's own reads.
		get children() {
			const content = (): JSX.Element => createComponent(render, renderProps(state, depth, match.kind));
			return guard(state, depth, content);
		},
	});
}

// A page gets its params, search, loader data, and preloader context. A layout also gets its children, the
// next slot (dx/types.md).
function renderProps(state: () => OutletState, depth: number, kind: OutletMatch["kind"]): Parameters<Render>[0] {
	const own = () => defined(state().matches[depth], "the slot's match");
	const props = {
		get loaderData() {
			return own().data;
		},
		get params() {
			return own().params;
		},
		get search() {
			return own().search;
		},
		get preloaderContext() {
			return own().preloader ?? {};
		},
	};
	if (kind === "page") return props;
	return merge(props, {
		get children() {
			return renderSlot(state, depth + 1);
		},
	});
}

// InterceptOutlet's child paints a throw by the walk from the layout that owns the outlet, as a slot does (B41).
export function ownerGuard(content: () => JSX.Element): JSX.Element {
	const slot = defined(useContext(SlotContext), "the layout that owns the outlet");
	return guard(slot.state, slot.depth - 1, content);
}

// On the client, a rejection the app's own <Errored> did not catch, such as a deferred `e`, is the B77 walk from
// this slot (B80), and in dev it is a bug the overlay shows. A server render throw is a status instead (B93).
function guard(state: () => OutletState, depth: number, content: () => JSX.Element): JSX.Element {
	return createComponent(Errored, {
		// Solid 2 hands the fallback the error as an accessor.
		fallback: (read: () => unknown) => {
			const error = untrack(read);
			const current = untrack(state);
			// The server keeps a render throw as a status (B93). It still renders the boundary, so the tree and its
			// hydration keys match the client's, and Solid's server boundary contains a rethrow, so it records it.
			if (isServer) return void current.failRender?.(error);
			current.onBoundaryError(error);
			const thrown = error instanceof Error ? error : new Error(String(error));
			return paintFailure(current, { index: depth, status: 500, error: thrown });
		},
		get children() {
			return content();
		},
	});
}

// The walk starts at the failed match and moves toward the root. The first function of the failure's kind
// paints the failed slot with its own route's params and search (B77).
function paintFailure(state: OutletState, failure: NonNullable<OutletState["failure"]>): JSX.Element {
	const kind = boundaryKind(failure.status);
	const reset = resetOf(state);
	const slots = state.matches.map((match) => ({ kind: match.kind, module: match.module.boundaries ?? NONE }));
	for (let from = failure.index; ;) {
		const at = boundaryAt(slots, from, failure.status);
		const paint = at === null ? undefined : defined(slots[at], "the boundary slot").module[kind];
		if (at === null || paint === undefined) return builtin(failure.status);
		const owner = defined(state.matches[at], "the boundary owner");
		try {
			// One props object serves every kind. An auth boundary ignores `reset`.
			const props = { error: failure.error, reset, params: owner.params, search: owner.search };
			return paint(props);
		} catch (error) {
			state.onBoundaryError(error);
			from = at - 1;
		}
	}
}

// The browser's navigator revalidates the page on screen. The server has none, and a render never calls it. The
// URL is rebuilt from the raw records, not from an `.input()` output.
function resetOf(state: OutletState): () => void {
	const navigate = useContext(NavigateContext);
	if (navigate === null) return () => undefined;
	const router = useRouter();
	const location = useContext(LocationContext);
	return boundaryReset(navigate, () => ({
		to: defined(state.matches.at(-1), "the page on screen").id,
		params: rawParams(router, location().pathname),
		search: readSearch(location().search),
	}));
}

function builtin(status: number): JSX.Element {
	return createComponent(Dynamic, { component: "div", children: boundaryFallback(status) });
}
