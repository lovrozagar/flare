/*
 * The DOM nodes each outlet depth currently renders. Navigation reads the depth an update swaps
 * to scope its view transition to the boundary around them. Internal.
 */
const nodesByDepth = new Map<number, readonly Node[]>();

export function setOutletNodes(depth: number, nodes: readonly Node[]): () => void {
	nodesByDepth.set(depth, nodes);
	return () => {
		if (nodesByDepth.get(depth) === nodes) nodesByDepth.delete(depth);
	};
}

export function outletNodes(depth: number): readonly Node[] {
	return nodesByDepth.get(depth) ?? [];
}

/** Every node any outlet depth renders. */
export function allOutletNodes(): Node[] {
	return [...nodesByDepth.values()].flat();
}

/** Tests only. */
export function resetOutletNodes(): void {
	nodesByDepth.clear();
}
