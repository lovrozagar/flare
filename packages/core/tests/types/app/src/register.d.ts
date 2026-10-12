// What the app declares itself. The generated register adds the route maps (dx/types.md).
export {};

declare module "@lovrozagar/flare" {
	interface FlareRegister {
		auth: { userId: string };
		env: { site: string };
		serverContext: { requestId: string };
	}
}
