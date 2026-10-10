/*
 * Elements that may scope a navigation's view transition. Navigation picks the innermost one that
 * wraps the swapped route content; none → a document transition. Internal: not a public export.
 */
const boundaries = new Set<Element>();

/** Registered boundary elements, in registration order. */
export function registeredBoundaries(): ReadonlySet<Element> {
	return boundaries;
}

export function registerBoundary(element: Element): () => void {
	boundaries.add(element);
	return () => {
		boundaries.delete(element);
	};
}

/** Clear the registry. Tests only. */
export function resetViewTransitionBoundaries(): void {
	boundaries.clear();
}
