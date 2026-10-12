import type { JSX } from "@solidjs/web";
import type { Callback } from "./chain.ts";

// The raw record, or whatever that side's `.input()` validator returned (dx/builder.md). The generated route
// types narrow it per route id (dx/types.md).
type Params = unknown;

// The function's own route, not the failed match's (B77).
export type Located = { params: Params; search: Params };

// `reset()` revalidates the current URL in place (dx/builder.md).
export type ErrorRender = Callback<Located & { error: Error; reset: () => void }, JSX.Element>;

export type NotFoundRender = Callback<Located, JSX.Element>;

// An auth boundary gets the error and no `reset` (dx/types.md).
export type AuthRender = Callback<Located & { error: Error }, JSX.Element>;

export type BoundaryRecord = {
	errorRender?: ErrorRender;
	notFoundRender?: NotFoundRender;
	unauthenticatedRender?: AuthRender;
	unauthorizedRender?: AuthRender;
};

// `L` is the route's own params and search, typed when its builder knows them (dx/types.md). An auth boundary
// gets the error and no `reset`.
type Methods<R, L extends Located> = {
	errorRender: (fn: (props: L & { error: Error; reset: () => void }) => JSX.Element) => Bounded<R, L>;
	notFoundRender: (fn: (props: L) => JSX.Element) => Bounded<R, L>;
	unauthenticatedRender: (fn: (props: L & { error: Error }) => JSX.Element) => Bounded<R, L>;
	unauthorizedRender: (fn: (props: L & { error: Error }) => JSX.Element) => Bounded<R, L>;
};

export type Bounded<R, L extends Located = Located> = R & { boundaries?: BoundaryRecord } & Methods<R, L>;

// The boundary methods come after render. They are not enumerable, so the record a route exports stays plain
// data and spreading it does not copy builder steps.
export function withBoundaries<R extends { boundaries?: BoundaryRecord }, L extends Located = Located>(
	record: R,
): Bounded<R, L> {
	const add = (kind: keyof BoundaryRecord, added: BoundaryRecord): Bounded<R, L> => {
		if (record.boundaries?.[kind] !== undefined) throw new Error(`${kind} twice`);
		return withBoundaries<R, L>({ ...record, boundaries: { ...record.boundaries, ...added } });
	};
	const methods: Methods<R, L> = {
		errorRender: (fn) => add("errorRender", { errorRender: fn }),
		notFoundRender: (fn) => add("notFoundRender", { notFoundRender: fn }),
		unauthenticatedRender: (fn) => add("unauthenticatedRender", { unauthenticatedRender: fn }),
		unauthorizedRender: (fn) => add("unauthorizedRender", { unauthorizedRender: fn }),
	};
	const bounded = Object.assign({ ...record }, methods);
	for (const name of Object.keys(methods)) Object.defineProperty(bounded, name, { enumerable: false });
	return bounded;
}
