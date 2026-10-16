import type { BuilderId } from "./scan.ts"

// Dev writes a route file's builder id strings to the id its path gives (dx/routes.md, BUGS.md 130), as TanStack
// Router's generator writes `createFileRoute`'s. Each span is a string literal the scan resolved: a call's own, or the
// module-level const it names, which every other use of that const then reads too. The literal keeps its quote. The
// edits go from the last span back, so an earlier span's offsets still hold. A file already right comes back as the
// same string.
export function fixIds(source: string, id: string, ids: readonly BuilderId[]): string {
	const spans = new Map<number, BuilderId>()
	for (const found of ids) if (found.id !== id) spans.set(found.start, found)
	let text = source
	for (const span of [...spans.values()].sort((left, right) => right.start - left.start)) {
		text = `${text.slice(0, span.start)}${quoted(id, text.charAt(span.start))}${text.slice(span.end)}`
	}
	return text
}

function quoted(id: string, quote: string): string {
	return `${quote}${id.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`)}${quote}`
}
