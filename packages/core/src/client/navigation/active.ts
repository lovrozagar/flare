import type { FlareRegister } from "../../shared/route-builder/register.ts"
import type { Navigate, NavigateTo } from "../../shared/router/context.ts"

type Go = (options: NavigateTo) => Promise<void>

// The booted client's navigation, which `navigate` reaches from outside any component (dx/navigate.md).
const active: { go: Go | undefined } = { go: undefined }

// createClient sets it once the client has booted and clears it when the client is disposed.
export function setActiveNavigate(go: Go | undefined): void {
	active.go = go
}

// A navigation from anywhere on the client: an event handler, a module, a callback outside the tree. It is the function
// `useNavigate()` returns. Before createClient has booted, and on the server, there is no navigator, so it rejects
// (BUGS.md 105).
export const navigate: Navigate<FlareRegister> = (options) =>
	active.go === undefined
		? Promise.reject(new Error("navigate runs in the browser, once createClient has booted"))
		: active.go(options)
