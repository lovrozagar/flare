import { onCleanup, useContext } from "solid-js";
import {
	BlockerContext,
	type Blocker,
	type BlockerArgs,
	type BlockerPlace,
	type Blockers,
	type BlockerSteps,
} from "../../shared/router/context.ts";

export { BlockerContext, type Blocker, type BlockerArgs, type BlockerPlace, type Blockers, type BlockerSteps };

// One stack per client. Only the last registered blocker runs (B84).
export function createBlockers(): Blockers {
	const stack: Blocker[] = [];
	const last = (): Blocker | undefined => stack.at(-1);
	return {
		register(blocker) {
			stack.push(blocker);
			// A second dispose must not remove another blocker: lastIndexOf is -1 once this one is gone.
			return () => {
				const at = stack.lastIndexOf(blocker);
				if (at !== -1) stack.splice(at, 1);
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
