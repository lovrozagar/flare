import { expect, it, vi } from "vitest"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../errors/http.ts"
import { statusOf } from "../errors/status.ts"
import { boundaryAt, boundaryFallback, boundaryReset, type BoundarySlot } from "./boundary.ts"

const paint = (): string => "fallback"

function slot(kind: BoundarySlot["kind"], module: BoundarySlot["module"] = {}): BoundarySlot {
	return { kind, module }
}

it("own", () => {
	const slots = [slot("layout", { errorRender: paint }), slot("page", { errorRender: paint })]
	expect(boundaryAt(slots, 1, 500)).toBe(1)
})

it("parent", () => {
	const slots = [slot("layout"), slot("layout", { errorRender: paint }), slot("page")]
	expect(boundaryAt(slots, 2, 500)).toBe(1)
})

it("segment", () => {
	const slots = [slot("layout", { errorRender: paint }), slot("segment", { errorRender: paint }), slot("page")]
	expect(boundaryAt(slots, 2, 500)).toBe(0)
})

it("segment only", () => {
	const slots = [slot("layout"), slot("segment", { errorRender: paint }), slot("page")]
	expect(boundaryAt(slots, 2, 500)).toBeNull()
})

it("separate", () => {
	const slots = [slot("layout"), slot("page", { errorRender: paint })]
	expect(boundaryAt(slots, 1, statusOf(new NotFoundError()))).toBeNull()
	const found = [slot("layout"), slot("page", { errorRender: paint, notFoundRender: paint })]
	expect(boundaryAt(found, 1, 404)).toBe(1)
})

it("auth separate", () => {
	const slots = [slot("layout", { errorRender: paint }), slot("page", { errorRender: paint })]
	expect(boundaryAt(slots, 1, statusOf(new UnauthenticatedError()))).toBeNull()
	expect(boundaryAt(slots, 1, statusOf(new UnauthorizedError()))).toBeNull()
	const guarded = [slot("layout", { unauthenticatedRender: paint, unauthorizedRender: paint }), slot("page")]
	expect(boundaryAt(guarded, 1, 401)).toBe(0)
	expect(boundaryAt(guarded, 1, 403)).toBe(0)
})

it("none", () => {
	expect(boundaryAt([slot("layout"), slot("page")], 1, 500)).toBeNull()
})

it("text", () => {
	expect(boundaryFallback(500)).toBe("Something went wrong")
	expect(boundaryFallback(404)).toBe("Page not found")
	expect(boundaryFallback(401)).toBe("Please log in")
	expect(boundaryFallback(403)).toBe("Access denied")
})

it("reset", () => {
	const navigate = vi.fn<Parameters<typeof boundaryReset>[0]>()
	const current = { to: "_root_/users/[id]", params: { id: "1" }, search: { tab: "a" } }
	boundaryReset(navigate, () => current)()
	expect(navigate).toHaveBeenCalledExactlyOnceWith({ ...current, replace: true, revalidate: true })
})
