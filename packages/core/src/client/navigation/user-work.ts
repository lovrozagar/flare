// The user's own requests in flight, which the idle warm-up of every route module yields to: a navigation's data, a
// server function call, a prefetch a link's trigger fired. Over HTTP/1.1 a browser opens six connections to a host,
// and a warm that held them made the user's request wait behind it (BUGS.md 520, decision B127).
export type UserWork = {
	// Marks work as started; the returned function marks it done, once.
	begin: () => () => void
	busy: () => boolean
	// Runs `run` once nothing is in flight: at once, when the last piece of work ends, or when the oldest open entry
	// passes the bound.
	whenIdle: (run: () => void) => void
}

// An entry is forgotten once it is older than `bound`, so a call that never settles cannot pause the warm for good. No
// polling while the user is busy: the last end runs the waiters, and one timer covers an entry that never ends.
export function userWork(now: () => number, bound = 30_000): UserWork {
	const open = new Map<object, number>()
	const waiters: (() => void)[] = []
	let timer: ReturnType<typeof setTimeout> | undefined
	const busy = (): boolean => {
		const at = now()
		for (const [token, started] of open) if (at - started > bound) open.delete(token)
		return open.size > 0
	}
	const settle = (): void => {
		if (waiters.length === 0) return
		if (busy()) return arm()
		clearTimeout(timer)
		timer = undefined
		for (const run of waiters.splice(0)) run()
	}
	// The one timer, set for when the oldest open entry passes the bound.
	const arm = (): void => {
		if (timer !== undefined) return
		const oldest = Math.min(...open.values())
		timer = setTimeout(
			() => {
				timer = undefined
				settle()
			},
			Math.max(0, oldest + bound - now() + 1),
		)
	}
	return {
		begin() {
			const token = {}
			open.set(token, now())
			return () => {
				if (open.delete(token)) settle()
			}
		},
		busy,
		whenIdle(run) {
			waiters.push(run)
			settle()
		},
	}
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

// A fetch that counts as user work from its call until its answer's head arrives or it fails: by then the request has
// had its connection.
export function countedFetch(fetch: Fetch, work: UserWork): Fetch {
	return (url, init) => {
		const done = work.begin()
		return fetch(url, init).finally(done)
	}
}
