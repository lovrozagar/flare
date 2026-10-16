import type { FlareRegister } from "../../shared/route-builder/register.ts"
import type { Navigate, NavigateTo } from "../../shared/router/context.ts"

type Go = (options: NavigateTo) => Promise<void>

// The booted client's navigation and invalidation, which `navigate` and `invalidate` reach from outside any component
// (dx/navigate.md).
type Client = { navigate: Go; invalidate: () => Promise<void> }

const active: { client: Client | undefined } = { client: undefined }

// createClient sets it once the client has booted and clears it when the client is disposed.
export function setActiveClient(client: Client | undefined): void {
	active.client = client
}

// A navigation from anywhere on the client: an event handler, a module, a callback outside the tree. It is the function
// `useNavigate()` returns. Before createClient has booted, and on the server, there is no navigator, so it rejects
// (BUGS.md 105).
export const navigate: Navigate<FlareRegister> = (options) =>
	active.client === undefined
		? Promise.reject(new Error("navigate runs in the browser, once createClient has booted"))
		: active.client.navigate(options)

// Forgets every cached match, held prefetch, and query, then refetches the page on screen, as `revalidate: true`
// does. For a sign-in or sign-out Flare cannot see, such as an auth library's own fetch; a server function whose
// Response writes a cookie does the forgetting itself (B133). Before boot, and on the server, it rejects.
export function invalidate(): Promise<void> {
	return active.client === undefined
		? Promise.reject(new Error("invalidate runs in the browser, once createClient has booted"))
		: active.client.invalidate()
}
