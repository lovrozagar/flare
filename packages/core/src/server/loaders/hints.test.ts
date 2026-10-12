import { expect, it } from "vitest";
import { hints, type HintMatch } from "./hints.ts";

const root: HintMatch = { id: "&", layout: true };
const layout: HintMatch = { id: "org=a&", layout: true };
const page: HintMatch = { id: "org=a&id=1&q=x", layout: false };
const matches = [root, layout, page];

it("page skipped", () => {
	expect([...hints(page.id, matches)]).toEqual([page.id]);
	expect([...hints(`${layout.id} ${page.id}`, matches)]).toEqual([page.id]);
});

it("layout not skipped", () => {
	expect([...hints(layout.id, matches)]).toEqual([]);
	expect([...hints(root.id, matches)]).toEqual([]);
});

it("unknown id", () => {
	expect([...hints("org=b&id=2&", matches)]).toEqual([]);
	expect([...hints(null, matches)]).toEqual([]);
});

it("over cap", () => {
	expect([...hints("x".repeat(8193), matches)]).toEqual([page.id]);
	expect([...hints("é".repeat(4097), matches)]).toEqual([page.id]);
	expect([...hints("x".repeat(8192), matches)]).toEqual([]);
});
