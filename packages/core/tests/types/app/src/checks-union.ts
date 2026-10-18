// The dx/types.md `union output` row: a validator whose output is a union with no key in common still requires its
// object on a target, and takes either member's shape (BUGS.md 348). See checks.ts.
import { Link } from "@lovrozagar/flare"

{
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, search: { a: "x" }, children: "x" })
	void Link({ to: "_root_/either/[id]", params: { s: "x" }, search: { b: "y" }, children: "x" })
	// @ts-expect-error params are required
	void Link({ to: "_root_/either/[id]", search: { a: "x" }, children: "x" })
	// @ts-expect-error search is required
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, children: "x" })
	// @ts-expect-error neither member's shape
	void Link({ to: "_root_/either/[id]", params: { n: 1 }, search: { c: "z" }, children: "x" })
}
