import { warn } from "../logger.ts";

const warned = new WeakSet<Element>();

/*
 * Element-scoped view transitions need a box: the browser rejects `display: contents`, inline and
 * SVG scopes (`ready` rejects with InvalidStateError) and silently skips hidden or detached ones.
 */
function canScope(element: Element): boolean {
	if (!element.isConnected) return false;
	if (element === element.ownerDocument.documentElement) return false;
	if (typeof SVGElement !== "undefined" && element instanceof SVGElement) return false;
	const display = getComputedStyle(element).display;
	if (display === "contents" || display === "none" || display.startsWith("inline")) {
		if (!warned.has(element)) {
			warned.add(element);
			warn("nav", `<ViewTransitionBoundary> child has display: ${display}; using a document transition`);
		}
		return false;
	}
	return true;
}

/**
 * The element to scope a navigation's view transition to: the innermost boundary that contains
 * every node the update swaps and is not inside any of them (the update would remove it). Null
 * means a document transition.
 */
export function resolveTransitionScope(boundaries: Iterable<Element>, swapped: readonly Node[]): Element | null {
	if (swapped.length === 0) return null;
	const survivors: Element[] = [];
	for (const boundary of new Set(boundaries)) {
		if (!canScope(boundary)) continue;
		if (!swapped.every((node) => boundary !== node && boundary.contains(node))) continue;
		if (swapped.some((node) => node.contains(boundary))) continue;
		survivors.push(boundary);
	}
	return (
		survivors.find((candidate) => !survivors.some((other) => other !== candidate && candidate.contains(other))) ?? null
	);
}
