import { expect, it } from "vitest";
import { mergeHead } from "./merge.ts";
import { headTags } from "./tags.ts";

it("replace", () => {
	const parent = { title: "P", images: [{ url: "/p.png" }], meta: { author: "P" } };
	expect(mergeHead(parent, { title: "C" }, true)).toEqual({ title: "C" });
	const merged = mergeHead(parent, { images: [{ url: "/c.png" }], meta: { author: "C" } });
	expect(merged.title).toBe("P");
	expect(merged.images).toEqual([{ url: "/p.png" }, { url: "/c.png" }]);
	expect(merged.meta).toEqual({ author: "C" });
});

it("empty records", () => {
	const merged = mergeHead({ title: "Root" }, { description: "D" });
	expect(merged.openGraph).toBeUndefined();
	expect(mergeHead({ robots: {} }, {}).robots).toEqual({});
	expect(headTags(merged).map((tag) => tag.key)).toEqual(["title", "meta:description:0"]);
});
