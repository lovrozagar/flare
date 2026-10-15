import { defined } from "../errors/defined.ts"

export type BoundaryKind = "errorRender" | "notFoundRender" | "unauthenticatedRender" | "unauthorizedRender"

// A segment has no boundary of its own, so the walk skips it even when its module carries one.
export type BoundarySlot = {
	kind: "layout" | "page" | "segment"
	module: Partial<Record<BoundaryKind, unknown>>
}

type Raw = Record<string, string | string[]>

type Current = { to: string; params: Raw; search: Raw }

type Navigate = (options: Current & { replace: true; revalidate: true }) => void

const NAMED: Record<number, { kind: BoundaryKind; text: string }> = {
	401: { kind: "unauthenticatedRender", text: "Please log in" },
	403: { kind: "unauthorizedRender", text: "Access denied" },
	404: { kind: "notFoundRender", text: "Page not found" },
}

const OTHER = { kind: "errorRender", text: "Something went wrong" } as const

export function boundaryKind(status: number): BoundaryKind {
	return (NAMED[status] ?? OTHER).kind
}

// One failure uses one column (B77): the walk from `from` toward the root reads only that status's function.
export function boundaryAt(slots: readonly BoundarySlot[], from: number, status: number): number | null {
	const kind = boundaryKind(status)
	for (let index = from; index >= 0; index -= 1) {
		const slot = defined(slots[index], "the boundary slot")
		if (slot.kind !== "segment" && slot.module[kind] !== undefined) return index
	}
	return null
}

export function boundaryFallback(status: number): string {
	return (NAMED[status] ?? OTHER).text
}

// reset() revalidates the current URL in place. It never pushes, and there is no retry prop (B82).
export function boundaryReset(navigate: Navigate, current: () => Current): () => void {
	return () => navigate({ ...current(), replace: true, revalidate: true })
}
