import { expect, it } from "vitest";
import { effectiveAuth, type AuthSource } from "./effective.ts";

const required = { mode: true, callerData: [] } as const;
const optional = { mode: "optional", callerData: [] } as const;

it("authenticate requires", () => {
	expect(effectiveAuth([{ auth: required }])).toEqual({ requires: true, reads: true });
});

it("optional reads", () => {
	expect(effectiveAuth([{ auth: optional }])).toEqual({ requires: false, reads: true });
});

it("authorize reads", () => {
	expect(effectiveAuth([{ authorize: () => true }])).toEqual({ requires: false, reads: true });
	expect(effectiveAuth([{}])).toEqual({ requires: false, reads: false });
});

it("layout requires", () => {
	const page: AuthSource = {};
	const layout: AuthSource = { auth: required };
	expect(effectiveAuth([page, layout])).toEqual({ requires: true, reads: true });
});

it("hint is ignored", () => {
	expect(effectiveAuth([{ auth: required, hint: "public" }])).toEqual({ requires: true, reads: true });
});
