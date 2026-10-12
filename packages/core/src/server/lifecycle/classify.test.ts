import { expect, it } from "vitest";
import { classify } from "./classify.ts";

it("no param is a document", () => {
	expect(classify(new URL("http://localhost/"))).toMatchObject({ status: 200, kind: "document" });
});

it("server fn path", () => {
	expect(classify(new URL("http://localhost/_flare/fn/abc"))).toEqual({ status: 404 });
});

it("data", () => {
	expect(classify(new URL("http://localhost/?_flare=data"))).toMatchObject({ status: 200, kind: "data" });
});

it("prefetch", () => {
	expect(classify(new URL("http://localhost/?_flare=prefetch"))).toMatchObject({ status: 200, kind: "prefetch" });
});
