// What the app declares itself. The generated register adds the route maps (dx/types.md).
export {}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

declare module "@lovrozagar/flare" {
	interface FlareRegister {
		auth: { user: string; role: "admin" | "reader"; callerData: readonly unknown[] }
		env: { ASSETS?: { fetch: Fetch }; DOCS_PRERENDER?: string }
		serverContext: { requestId: string; upstream: { fetch: Fetch; calls: () => number } }
	}
}
