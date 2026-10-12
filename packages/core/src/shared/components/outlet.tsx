import { createComponent, createContext, createMemo, untrack, useContext } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import type { ChainRecord } from "../route-builder/chain.ts";
import type { BoundaryRecord, Located, NotFoundRender } from "../route-builder/index.ts";
import { boundaryAt, boundaryFallback, boundaryKind } from "./boundary.ts";

export type OutletMatch = Located & {
	id: string;
	kind: "layout" | "page";
	module: { render?: ChainRecord["render"]; boundaries?: BoundaryRecord };
	data: unknown;
};

// `failure.index` is the root-most failed match. `unknown` is an unknown URL: the slot after the last layout
// paints the not-found the router chose (B77). A boundary function that throws is reported, then skipped.
export type OutletState = {
	matches: readonly OutletMatch[];
	failure?: { index: number; status: number; error: Error };
	unknown?: { render?: NotFoundRender };
	onBoundaryError: (error: unknown) => void;
};

const NONE: BoundaryRecord = {};

type Slot = { state: () => OutletState; depth: number };

const SlotContext = createContext<Slot>();

export function Outlet(): JSX.Element {
	const slot = useContext(SlotContext);
	return renderSlot(slot.state, slot.depth);
}

export function Matches(props: { state: () => OutletState }): JSX.Element {
	return renderSlot(props.state, 0);
}

// A slot remounts only when its key changes: a new match id at that depth, or a failure painted there. A loader
// refresh keeps the key, so the component stays and reads the new data.
function renderSlot(state: () => OutletState, depth: number): JSX.Element {
	const key = createMemo(() => slotKey(state(), depth));
	const slot = createMemo(() => {
		key();
		return untrack(() => paintSlot(state, depth));
	});
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
	const owner = current.matches[depth - 1];
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
			return createComponent(render, {
				get loaderData() {
					return state().matches[depth].data;
				},
				get children() {
					return renderSlot(state, depth + 1);
				},
			});
		},
	});
}

// The walk starts at the failed match and moves toward the root. The first function of the failure's kind
// paints the failed slot with its own route's params and search (B77).
function paintFailure(state: OutletState, failure: NonNullable<OutletState["failure"]>): JSX.Element {
	const kind = boundaryKind(failure.status);
	const slots = state.matches.map((match) => ({ kind: match.kind, module: match.module.boundaries ?? NONE }));
	for (let from = failure.index; ;) {
		const at = boundaryAt(slots, from, failure.status);
		const paint = at === null ? undefined : slots[at].module[kind];
		if (at === null || paint === undefined) return builtin(failure.status);
		const owner = state.matches[at];
		try {
			return paint({ error: failure.error, params: owner.params, search: owner.search });
		} catch (error) {
			state.onBoundaryError(error);
			from = at - 1;
		}
	}
}

function builtin(status: number): JSX.Element {
	return createComponent(Dynamic, { component: "div", children: boundaryFallback(status) });
}
