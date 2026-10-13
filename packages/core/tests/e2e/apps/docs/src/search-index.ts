import { docs } from "./content.ts";

export type Hit = { slug: string; title: string; summary: string };

// A plain substring search over titles and summaries. The search server function and the search loader share it.
export function searchIndex(query: string): Hit[] {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	return docs
		.filter((doc) => `${doc.title} ${doc.summary}`.toLowerCase().includes(needle))
		.map((doc) => ({ slug: doc.slug, title: doc.title, summary: doc.summary }));
}
