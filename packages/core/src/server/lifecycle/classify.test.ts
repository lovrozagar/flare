import { expect, it } from "vitest";
import { classify } from "./classify.ts";

it("no param is a document", () => {
	expect(classify({ path: "/" }).kind).toBe("document");
});

it("server fn path", () => {
	let calls = 0;
	const result = classify({
		path: "/_flare/fn/abc",
		router() {
			calls += 1;
		},
	});
	expect(result.status).toBe(404);
	expect(calls).toBe(0);
});

it("data is 400", () => {
	expect(classify({ path: "/?_flare=data" }).status).toBe(400);
});

it("prefetch is 400", () => {
	expect(classify({ path: "/?_flare=prefetch" }).status).toBe(400);
});
