import type { JSX } from "@solidjs/web";

// The raw record, or whatever that side's `.input()` validator returned (dx/builder.md). The generated route
// types narrow it per route id (dx/types.md).
type Params = unknown;

// The function's own route, not the failed match's (B77).
export type Located = { params: Params; search: Params };

// `reset()` revalidates the current URL in place (dx/builder.md).
export type ErrorRender = (props: Located & { error: Error; reset: () => void }) => JSX.Element;

export type NotFoundRender = (props: Located) => JSX.Element;

export type BoundaryRecord = {
	errorRender?: ErrorRender;
	notFoundRender?: NotFoundRender;
	unauthenticatedRender?: ErrorRender;
	unauthorizedRender?: ErrorRender;
};

type Methods<R> = {
	errorRender: (fn: ErrorRender) => Bounded<R>;
	notFoundRender: (fn: NotFoundRender) => Bounded<R>;
	unauthenticatedRender: (fn: ErrorRender) => Bounded<R>;
	unauthorizedRender: (fn: ErrorRender) => Bounded<R>;
};

export type Bounded<R> = R & { boundaries?: BoundaryRecord } & Methods<R>;

// The boundary methods come after render. They are not enumerable, so the record a route exports stays plain
// data and spreading it does not copy builder steps.
export function withBoundaries<R extends { boundaries?: BoundaryRecord }>(record: R): Bounded<R> {
	const add = (kind: keyof BoundaryRecord, added: BoundaryRecord): Bounded<R> => {
		if (record.boundaries?.[kind] !== undefined) throw new Error(`${kind} twice`);
		return withBoundaries({ ...record, boundaries: { ...record.boundaries, ...added } });
	};
	const methods: Methods<R> = {
		errorRender: (fn) => add("errorRender", { errorRender: fn }),
		notFoundRender: (fn) => add("notFoundRender", { notFoundRender: fn }),
		unauthenticatedRender: (fn) => add("unauthenticatedRender", { unauthenticatedRender: fn }),
		unauthorizedRender: (fn) => add("unauthorizedRender", { unauthorizedRender: fn }),
	};
	const bounded = Object.assign({ ...record }, methods);
	for (const name of Object.keys(methods)) Object.defineProperty(bounded, name, { enumerable: false });
	return bounded;
}
