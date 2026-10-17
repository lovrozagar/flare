// The requests a navigator runs. Starting one aborts the newest that has not committed, so only the latest may
// commit (02-system). The request whose page is on screen is not aborted then: its deferred values stream on until
// another page commits, so a navigation that commits nothing leaves them settling (plan 21 13.11). `cancel` is a move
// that stays on the page, a hash or shallow one: it is the latest, so the newest pending request is aborted, and the
// page's own deferred values stream on. A fill is not aborted: it lands its values onto the page as the move left it
// (`request.ts` `onPage`, plan 21 3.11, BUGS.md 311).
export function navigationRequests(): {
	start: (fill?: boolean) => AbortController
	cancel: () => void
	latest: (request: AbortController) => boolean
	committed: (request: AbortController) => void
} {
	let latest: AbortController | undefined
	let showing: AbortController | undefined
	const fills = new WeakSet<AbortController>()
	return {
		start(fill = false) {
			if (latest !== showing) latest?.abort()
			latest = new AbortController()
			if (fill) fills.add(latest)
			return latest
		},
		cancel() {
			if (latest === undefined || latest === showing || fills.has(latest)) return
			latest.abort()
			latest = showing
		},
		latest: (request) => request === latest,
		committed(request) {
			if (showing !== request) showing?.abort()
			showing = request
		},
	}
}
