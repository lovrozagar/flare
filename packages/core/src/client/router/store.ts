import { createSignal } from "solid-js";
import type { OutletMatch, OutletState } from "../../shared/components/index.ts";
import type { FrameError } from "../../shared/protocol/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { notFoundRenderOf, type LoadedEntry } from "../../shared/router/create-router.ts";
import type { Location } from "../../shared/url/index.ts";

// One state-script entry (B83).
export type ScriptMatch = {
	id: string;
	params: Record<string, string | string[]>;
	search: Record<string, string | string[]>;
	data: unknown;
	preloader: unknown;
	head: HeadConfig | null;
	error: WireError | null;
};

// What the page shows: the painted matches, their heads, the failure painted below them, and the URL.
export type StoreSnapshot = {
	matches: OutletMatch[];
	heads: (HeadConfig | undefined)[];
	failure?: OutletState["failure"];
	unknown?: OutletState["unknown"];
	location: Location;
};

export type RouterStore = {
	snapshot: () => StoreSnapshot;
	outlet: () => OutletState;
	commit: (next: StoreSnapshot) => void;
};

export type WireError = FrameError & { name?: string };

const NAMED: Record<string, number> = { NotFoundError: 404, UnauthenticatedError: 401, UnauthorizedError: 403 };

// One signal the outlet reads. A commit swaps the whole snapshot.
export function createRouterStore(initial: StoreSnapshot, onBoundaryError: (error: unknown) => void): RouterStore {
	const [snapshot, setSnapshot] = createSignal(initial);
	return {
		snapshot,
		outlet: () => {
			const current = snapshot();
			return { matches: current.matches, failure: current.failure, unknown: current.unknown, onBoundaryError };
		},
		commit: (next) => void setSnapshot(next),
	};
}

// Hydrate reads the state script and the loaded chain. A match whose `error` is set is the painted failure.
export function snapshotFromState(input: {
	matches: readonly ScriptMatch[];
	chain: readonly LoadedEntry[];
	unknown: boolean;
	location: Location;
}): StoreSnapshot {
	const matches = input.matches.map((match, index): OutletMatch => {
		const entry = input.chain[index];
		return {
			id: match.id,
			kind: entry.kind,
			module: entry.module,
			params: match.params,
			search: match.search,
			data: match.data,
		};
	});
	const failed = input.matches.findIndex((match) => match.error !== null);
	const wire = input.matches[failed]?.error;
	const snapshot: StoreSnapshot = {
		matches,
		heads: input.matches.map((match) => match.head ?? undefined),
		location: input.location,
	};
	if (wire) snapshot.failure = { index: failed, ...errorFromWire(wire) };
	if (input.unknown) snapshot.unknown = { render: notFoundRenderOf(input.chain) };
	return snapshot;
}

// The client builds the Error from the wire before it paints (B76, B83). A named status comes back from its
// class name. Production has no stack, so `stack` is "".
export function errorFromWire(wire: WireError): { status: number; error: Error } {
	const error = new Error(wire.message);
	error.name = wire.name ?? "Error";
	error.stack = wire.stack ?? "";
	return { status: NAMED[error.name] ?? 500, error };
}
