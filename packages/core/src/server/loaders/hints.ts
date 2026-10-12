export type HintMatch = { id: string; layout: boolean };

const CAP_BYTES = 8 * 1024;

// The ids are joined with one space. A match id is raw params plus raw search, and a parsed URL never
// keeps a raw space in either, so the split cannot cut an id (B30).
export function hints(stale: string | null, matches: readonly HintMatch[]): ReadonlySet<string> {
	if (stale === null) return new Set();
	const allPages = new TextEncoder().encode(stale).length > CAP_BYTES;
	const listed = new Set(stale.split(" "));
	const skipped = new Set<string>();
	for (const match of matches) {
		if (match.layout) continue;
		if (allPages || listed.has(match.id)) skipped.add(match.id);
	}
	return skipped;
}
