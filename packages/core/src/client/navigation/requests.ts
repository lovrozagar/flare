// The requests a navigator runs. Starting one aborts the newest that has not committed, so only the latest may
// commit (02-system). The request whose page is on screen is not aborted then: its deferred values stream on until
// another page commits, so a navigation that commits nothing leaves them settling (plan 21 13.11).
export function navigationRequests(): {
	start: () => AbortController
	latest: (request: AbortController) => boolean
	committed: (request: AbortController) => void
} {
	let latest: AbortController | undefined
	let showing: AbortController | undefined
	return {
		start() {
			if (latest !== showing) latest?.abort()
			latest = new AbortController()
			return latest
		},
		latest: (request) => request === latest,
		committed(request) {
			if (showing !== request) showing?.abort()
			showing = request
		},
	}
}
