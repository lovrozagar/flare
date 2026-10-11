import { expect, it } from "vitest";
import { chooseNodes } from "./outlet-nodes.ts";

it("matched nodes", () => {
	const nodes = chooseNodes(new Set(["root", "page"]), "page", ["root", "other"]);
	expect(nodes.page).toBe("page");
	expect(nodes.layouts).toEqual(["root"]);
	expect(chooseNodes(new Set(["root"]), "page", ["root"]).page).toBeUndefined();
});
