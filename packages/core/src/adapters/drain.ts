import { parseDuration } from "../shared/duration/index.ts"

// How long a drain waits, as a duration: a few seconds under the platform's grace period before it kills the process.
export type DrainOptions = { timeout: string }

// The work a Node or Bun process finishes before it exits: requests in flight and the background work they handed to
// `waitUntil`, a store write or a purge (plan 21 16.11). `drain` waits for all of it, work that joins meanwhile
// included, and resolves `true`, or `false` once the timeout passes first. `draining` is true from the first drain on.
export type Pending = {
	track: (work: Promise<unknown>) => void
	drain: (options: DrainOptions) => Promise<boolean>
	draining: () => boolean
}

// The longest delay a timer holds.
const MAX_TIMER = 2 ** 31 - 1

export function pendingWork(): Pending {
	const pending = new Set<Promise<unknown>>()
	const state = { draining: false }
	return {
		track(work) {
			pending.add(work)
			const release = (): void => void pending.delete(work)
			work.then(release, release)
		},
		draining: () => state.draining,
		async drain(options) {
			const timeout = parseDuration(options.timeout)
			state.draining = true
			const expired = Promise.withResolvers<false>()
			// A timer holds at most 2^31 - 1 ms and fires at once past it, so a longer timeout re-arms until its deadline
			// (BUGS.md 421).
			const deadline = Date.now() + timeout
			let timer: ReturnType<typeof setTimeout> | undefined
			const arm = (): void => {
				const left = deadline - Date.now()
				timer = setTimeout(() => (left > MAX_TIMER ? arm() : expired.resolve(false)), Math.min(left, MAX_TIMER))
			}
			arm()
			try {
				while (pending.size > 0) {
					const settled = Promise.allSettled(pending).then(() => true)
					if (!(await Promise.race([settled, expired.promise]))) return false
				}
				return true
			} finally {
				clearTimeout(timer)
			}
		},
	}
}
