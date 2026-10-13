import { createServerFn } from "@lovrozagar/flare/server-fn";
import { invalid } from "./issues.ts";

export type Tally = { slug: string; up: number; down: number };

// The votes live in the server process. A real app writes them to its database.
const tallies = new Map<string, Tally>();

function tallyOf(slug: string): Tally {
	return tallies.get(slug) ?? { slug, up: 0, down: 0 };
}

function slugInput(value: { slug: string }): { slug: string } {
	if (typeof value.slug !== "string" || !/^[a-z-]{1,40}$/.test(value.slug)) invalid("slug", "Unknown page");
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
