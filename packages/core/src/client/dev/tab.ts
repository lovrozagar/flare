import { TAB_HEADER } from "../../shared/protocol/index.ts"

type Fetch = (url: string, init: RequestInit) => Promise<Response>

// Vite's hot channel, as much of it as the client sends on.
export type DevHot = { send(event: string, payload: unknown): void }

// Dev only (dx/plugin.md, BUGS.md B42). The dev server writes a tab token into the document it serves. The tab
// announces it on the hot channel and names it on its own requests, so a server bug opens the overlay in this tab and
// no other. Production has no hot channel and no token, so the fetch comes back as it is.
export function tabbedFetch(fetch: Fetch, hot: DevHot | undefined, root: ParentNode): Fetch {
	const token = root.querySelector(`meta[name="${TAB_HEADER}"]`)?.getAttribute("content")
	if (hot === undefined || token === undefined || token === null) return fetch
	// The event the dev server's tab hub listens for (vite/dev/tabs.ts).
	hot.send("flare:tab", { token })
	return (url, init) => {
		const headers = new Headers(init.headers)
		headers.set(TAB_HEADER, token)
		return fetch(url, { ...init, headers })
	}
}
