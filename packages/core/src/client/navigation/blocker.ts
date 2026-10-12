import { createContext, onCleanup, useContext, type Context } from "solid-js";

export type BlockerPlace = {
	hash: string;
	pathname: string;
	search: string;
	params: Record<string, string | string[]>;
};

export type BlockerArgs = {
	current: BlockerPlace;
	next: BlockerPlace;
	trigger: "initial" | "navigation" | "revalidation";
};

export type Blocker = (args: BlockerArgs) => boolean;

// `write` is the history write this attempt would make. `pushed` counts entries it already pushed.
export type BlockerSteps = { write: () => void; pushed: number; go: (delta: number) => void };

export type Blockers = {
	register: (blocker: Blocker) => () => void;
	run: (args: BlockerArgs & { popstate?: boolean }, steps: BlockerSteps) => boolean;
	beforeUnload: (event: Event, current: BlockerPlace) => void;
};

export const BlockerContext: Context<Blockers> = createContext<Blockers>();

// One stack per client. Only the last registered blocker runs (B84).
export function createBlockers(): Blockers {
	const stack: Blocker[] = [];
	const last = (): Blocker | undefined => stack.at(-1);
	return {
		register(blocker) {
			stack.push(blocker);
			return () => {
				stack.splice(stack.lastIndexOf(blocker), 1);
			};
		},
		// `false` cancels before the history write. An attempt that already pushed walks back with history.go.
		run(args, steps) {
			const blocker = last();
			if (blocker !== undefined && consults(args) && !blocker(withoutPopstate(args))) {
				if (steps.pushed > 0) steps.go(-steps.pushed);
				return false;
			}
			steps.write();
			return true;
		},
		beforeUnload(event, current) {
			const blocker = last();
			if (blocker !== undefined && !blocker({ current, next: current, trigger: "navigation" })) event.preventDefault();
		},
	};
}

export function useBlocker(blocker: Blocker): void {
	onCleanup(useContext(BlockerContext).register(blocker));
}

// Hydrate, a popstate, and a revalidation of the same URL never ask the blocker.
function consults(args: BlockerArgs & { popstate?: boolean }): boolean {
	if (args.trigger === "initial" || args.popstate === true) return false;
	return args.trigger !== "revalidation" || href(args.current) !== href(args.next);
}

function withoutPopstate(args: BlockerArgs & { popstate?: boolean }): BlockerArgs {
	return { current: args.current, next: args.next, trigger: args.trigger };
}

function href(place: BlockerPlace): string {
	return `${place.pathname}${place.search}${place.hash}`;
}
