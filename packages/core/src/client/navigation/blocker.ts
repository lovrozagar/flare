import { onCleanup, useContext } from "solid-js"
import {
	BlockerContext,
	type Blocker,
	type BlockerArgs,
	type BlockerPlace,
	type Blockers,
	type BlockerSteps,
} from "../../shared/router/context.ts"
import type { Router } from "../../shared/router/create-router.ts"
import type { Location } from "../../shared/url/index.ts"

export { BlockerContext, type Blocker, type BlockerArgs, type BlockerPlace, type Blockers, type BlockerSteps }

// One stack per client. Only the last registered blocker runs (B84).
export function createBlockers(): Blockers {
	const stack: Blocker[] = []
	const last = (): Blocker | undefined => stack.at(-1)
	return {
		register(blocker) {
			stack.push(blocker)
			// A second dispose must not remove another blocker: lastIndexOf is -1 once this one is gone.
			return () => {
				const at = stack.lastIndexOf(blocker)
				if (at !== -1) stack.splice(at, 1)
			}
		},
		// `false` cancels before the history write. An attempt that already pushed walks back with history.go.
		run(args, steps) {
			const blocker = last()
			if (blocker !== undefined && consults(args) && !blocker(withoutPopstate(args))) {
				if (steps.pushed > 0) steps.go(-steps.pushed)
				return false
			}
			steps.write()
			return true
		},
		beforeUnload(event, current) {
			const blocker = last()
			if (blocker !== undefined && !blocker({ current, next: current, trigger: "navigation" })) event.preventDefault()
		},
	}
}

export function useBlocker(blocker: Blocker): void {
	onCleanup(useContext(BlockerContext).register(blocker))
}

// Hydrate, a popstate, and a revalidation of the same URL never ask the blocker.
function consults(args: BlockerArgs & { popstate?: boolean }): boolean {
	if (args.trigger === "initial" || args.popstate === true) return false
	return args.trigger !== "revalidation" || href(args.current) !== href(args.next)
}

function withoutPopstate(args: BlockerArgs & { popstate?: boolean }): BlockerArgs {
	return { current: args.current, next: args.next, trigger: args.trigger }
}

function href(place: BlockerPlace): string {
	return `${place.pathname}${place.search}${place.hash}`
}

// navigate asks the blocker before it writes anything, so nothing was pushed and history.go is not reached.
export function allowsNavigation(
	blockers: Blockers,
	router: Router,
	move: { current: Location; next: Location; trigger: BlockerArgs["trigger"] },
): boolean {
	const steps = { write: () => undefined, pushed: 0, go: history.go.bind(history) }
	const args = { current: placeIn(router, move.current), next: placeIn(router, move.next), trigger: move.trigger }
	return blockers.run(args, steps)
}

// A side of a move as the blocker reads it: the location and its page's raw params, an optional one left out when
// absent (dx/navigate.md `useBlocker`, BUGS.md 313).
export function placeIn(router: Router, location: Location): BlockerPlace {
	const params: BlockerPlace["params"] = {}
	for (const [key, value] of Object.entries(router.match(location.pathname).params)) {
		if (value !== undefined) params[key] = value
	}
	return { pathname: location.pathname, search: location.search, hash: location.hash, params }
}
