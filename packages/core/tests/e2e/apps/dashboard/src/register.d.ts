// What the app declares itself. The generated register adds the route maps (dx/types.md).
export {}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

declare module "@lovrozagar/flare" {
	interface FlareRegister {
		auth: import("./session.ts").Session
		env: { ASSETS?: { fetch: Fetch }; SESSION_SECRET?: string; FLARE_E2E?: string }
	}
}
