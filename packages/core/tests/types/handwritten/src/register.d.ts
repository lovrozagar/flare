// A register written by hand, as codegen never writes it: the app declares no `auth`, and the child's parent is
// listed in `routeParents` without a module in `routeModules` (dx/types.md Merge `a missing parent module`,
// `omitted auth`).
export {}

declare module "@lovrozagar/flare" {
	interface FlareRegister {
		routeModules: { "_root_/child": typeof import("./routes/child.page.tsx").route }
		routeParents: { "_root_/child": ["_root_/gone"] }
		pageIds: "_root_/child"
	}
}
