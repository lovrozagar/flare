// A node in `<head>` the server did not write, put there by an extension, a proxy, or an HTML rewriter, would shift
// the compiled root layout's positional walk of `<head>` and kill hydration (B120, BUGS.md 120). `sequence` is the
// server's `<head>` children (`headSequence`). The live `<head>` is aligned with it by longest common subsequence, so
// a foreign node that looks like the next server node, or a server node an extension removed, costs only itself.
// Every unmatched node is detached, and the returned function puts each back after the matched node before it, or
// first in `<head>` when none was. The caller restores right after the synchronous hydrate, in the same task, so no
// frame paints without them and nothing runs again.
export function guardHead(head: HTMLHeadElement, sequence: readonly string[] | undefined): () => void {
	if (sequence === undefined) return noop
	const live = [...head.childNodes]
	const kept = aligned(live.map(kindOf), sequence)
	const moved: { node: ChildNode; anchor: ChildNode | null }[] = []
	let anchor: ChildNode | null = null
	for (const [index, node] of live.entries()) {
		if (kept.has(index)) anchor = node
		else moved.push({ node, anchor })
	}
	if (moved.length === 0) return noop
	for (const { node } of moved) node.remove()
	return () => restore(head, moved)
}

function restore(head: HTMLHeadElement, moved: readonly { node: ChildNode; anchor: ChildNode | null }[]): void {
	let previous: { node: ChildNode; anchor: ChildNode | null } | undefined
	for (const entry of moved) {
		// A run of foreign nodes keeps its order: each after the one before it.
		const after = previous !== undefined && previous.anchor === entry.anchor ? previous.node : entry.anchor
		if (after === null) head.insertBefore(entry.node, head.firstChild)
		else if (after.parentNode === head) after.after(entry.node)
		else head.append(entry.node)
		previous = entry
	}
}

// The same encoding as `headSequence` on the server.
export function kindOf(node: Node): string {
	if (node instanceof Element) {
		return `${node.localName}${node.hasAttribute("data-dh") ? "+dh" : ""}${node.hasAttribute("_hk") ? "+hk" : ""}`
	}
	if (node instanceof Comment) return `!${node.data}`
	return "#"
}

// The indexes of `live` in one longest common subsequence with `expected`. The common prefix and suffix match first,
// so the table covers only the span that differs. A foreign node next to a server node of the same kind may be the
// one matched; the walk reads positions and kinds, so it still lands on the server's shape.
export function aligned(live: readonly string[], expected: readonly string[]): Set<number> {
	const kept = new Set<number>()
	let head = 0
	while (head < live.length && head < expected.length && live[head] === expected[head]) kept.add(head++)
	let tail = 0
	while (
		tail < live.length - head &&
		tail < expected.length - head &&
		live[live.length - 1 - tail] === expected[expected.length - 1 - tail]
	) {
		kept.add(live.length - 1 - tail)
		tail += 1
	}
	const a = live.slice(head, live.length - tail)
	const b = expected.slice(head, expected.length - tail)
	for (const index of middle(a, b)) kept.add(head + index)
	return kept
}

function middle(live: readonly string[], expected: readonly string[]): number[] {
	const columns = expected.length + 1
	const table = new Uint32Array((live.length + 1) * columns)
	// Every index read is inside the table, the last row and column being the zeros the walk ends on.
	const at = (i: number, j: number): number => Number(table[i * columns + j])
	for (let i = live.length - 1; i >= 0; i -= 1) {
		for (let j = expected.length - 1; j >= 0; j -= 1) {
			table[i * columns + j] = live[i] === expected[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
		}
	}
	const kept: number[] = []
	let i = 0
	let j = 0
	while (i < live.length && j < expected.length) {
		if (live[i] === expected[j] && at(i, j) !== at(i + 1, j)) {
			kept.push(i)
			i += 1
			j += 1
		} else if (at(i + 1, j) >= at(i, j + 1)) i += 1
		else j += 1
	}
	return kept
}

function noop(): void {}
