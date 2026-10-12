import { staleList } from "../../shared/protocol/index.ts";

export type HintMatch = { id: string; layout: boolean };

// The ids are joined with one space. A match id is raw params plus raw search, and a parsed URL never
// keeps a raw space in either, so the split cannot cut an id (B30). Layout ids are never skipped.
export function hints(stale: string | null, matches: readonly HintMatch[]): ReadonlySet<string> {
	const list = staleList(stale);
	if (list === null) return new Set();
	const skipped = new Set<string>();
	for (const match of matches) {
		if (match.layout) continue;
		if (list.all || list.ids.has(match.id)) skipped.add(match.id);
	}
	return skipped;
}
