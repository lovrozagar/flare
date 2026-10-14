import { createServerFn } from "@lovrozagar/flare/server-fn";
import { docOf } from "../content.ts";
import { invalid } from "./issues.ts";

export type Tally = { slug: string; up: number; down: number };

// The votes live in the server process. A real app writes them to its database.
const tallies = new Map<string, Tally>();

function tallyOf(slug: string): Tally {
	return tallies.get(slug) ?? { slug, up: 0, down: 0 };
}

// The slugs the doc route serves, so every doc page has a tally (BUGS.md 64: "i18n" failed a letters-only pattern).
function slugInput(value: { slug: string }): { slug: string } {
	if (typeof value.slug !== "string" || docOf(value.slug) === undefined) invalid("slug", "Unknown page");
	return { slug: value.slug };
}

export const feedbackCount = createServerFn({ method: "get" })
	.input({ parse: slugInput })
	.handler(({ input }) => tallyOf(input.slug));

export const vote = createServerFn()
	.input({
		parse: (value: { slug: string; helpful: boolean }) => ({ ...slugInput(value), helpful: value.helpful === true }),
	})
	.handler(({ input }) => {
		const current = tallyOf(input.slug);
		const next = input.helpful ? { ...current, up: current.up + 1 } : { ...current, down: current.down + 1 };
		tallies.set(input.slug, next);
		return next;
	});
