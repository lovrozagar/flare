import { expect, it } from "vitest";
import { effectiveAuth } from "./effective.ts";

it("authenticate requires", () => {
	expect(effectiveAuth([{ authenticate: true }])).toEqual({ requires: true, reads: true });
});

it("optional reads", () => {
	expect(effectiveAuth([{ authenticateOptional: true }])).toEqual({ requires: false, reads: true });
});

it("authorize reads", () => {
	expect(effectiveAuth([{ authorize: true }])).toEqual({ requires: false, reads: true });
});

it("layout requires", () => {
	expect(effectiveAuth([{ authenticate: true }, {}])).toEqual({ requires: true, reads: true });
});

it("hint is ignored", () => {
	expect(effectiveAuth([{ authenticate: true, hint: "public" }])).toEqual({ requires: true, reads: true });
});
