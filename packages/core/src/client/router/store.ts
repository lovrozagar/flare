import { createSignal } from "solid-js";
import type { OutletMatch, OutletState, Overlay } from "../../shared/components/index.ts";
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
	overlay?: Overlay;
};

export type RouterStore = {
	snapshot: () => StoreSnapshot;
	outlet: () => OutletState;
	commit: (next: StoreSnapshot) => void;
	scopeAt: (depth: number) => Element | Document;
};

export type WireError = FrameError & { name?: string };

const NAMED: Record<string, number> = { NotFoundError: 404, UnauthenticatedError: 401, UnauthorizedError: 403 };

// One signal the outlet reads. A commit swaps the whole snapshot.
export function createRouterStore(initial: StoreSnapshot, onBoundaryError: (error: unknown) => void): RouterStore {
	const [snapshot, setSnapshot] = createSignal(initial);
	const slots = new Map<number, () => Element | undefined>();
	const onSlot = (depth: number, scope: () => Element | undefined): (() => void) => {
		slots.set(depth, scope);
		return () => void (slots.get(depth) === scope && slots.delete(depth));
	};
	return {
		snapshot,
		outlet: () => {
			const current = snapshot();
			return { matches: current.matches, failure: current.failure, unknown: current.unknown, onBoundaryError, onSlot };
		},
		commit: (next) => void setSnapshot(next),
		// The innermost boundary around the outlet at that depth, or the document.
		scopeAt: (depth) => slots.get(depth)?.() ?? document,
	};
}

// The first slot whose match changed, else the deepest. A view transition scopes to the outlet there.
export function swappedDepth(previous: StoreSnapshot, next: StoreSnapshot): number {
	const changed = next.matches.findIndex((match, index) => previous.matches[index]?.id !== match.id);
	return changed === -1 ? next.matches.length - 1 : changed;
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
			preloader: isRecord(match.preloader) ? match.preloader : {},
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

const NAMED_STATUS: Record<number, string> = { 401: "UnauthenticatedError", 403: "UnauthorizedError" };

// A bare status paints its walked boundary. 401 and 403 keep their names, so the walk finds the auth render.
export function statusFailure(status: number, index: number): StoreSnapshot["failure"] {
	const error = new Error("Request failed");
	error.name = NAMED_STATUS[status] ?? "Error";
	error.stack = "";
	return { index, status: status in NAMED_STATUS ? status : 500, error };
}

// A loader `e` frame paints at the failed match.
export function landedFailure(
	landing: { failure?: { route: string; status: number; error: Error } },
	matches: readonly OutletMatch[],
): StoreSnapshot["failure"] {
	const failure = landing.failure;
	if (failure === undefined) return undefined;
	return {
		index: matches.findIndex((match) => match.id === failure.route),
		status: failure.status,
		error: failure.error,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
