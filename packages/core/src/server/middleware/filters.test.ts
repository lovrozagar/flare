import { expect, it } from "vitest";
import { enters } from "./filters.ts";

const page = (path: string) => ({ path, kind: "page" as const });

it("exact", () => {
	expect(enters({ exact: ["/about"] }, page("/about"))).toBe(true);
	expect(enters({ exact: ["/about"] }, page("/about/team"))).toBe(false);
});

it("case", () => {
	expect(enters({ exact: ["/About"] }, page("/about"))).toBe(true);
	expect(enters({ prefix: ["/Admin"] }, page("/admin/users"))).toBe(true);
});

it("prefix boundary", () => {
	expect(enters({ prefix: ["/admin"] }, page("/administrator"))).toBe(false);
});

it("prefix hit", () => {
	expect(enters({ prefix: ["/admin"] }, page("/admin/users"))).toBe(true);
	expect(enters({ prefix: ["/admin"] }, page("/admin"))).toBe(true);
	expect(enters({ prefix: ["/admin/"] }, page("/admin/users"))).toBe(true);
	// `exact` and `prefix` together match a path either one matches.
	expect(enters({ exact: ["/about"], prefix: ["/admin"] }, page("/about"))).toBe(true);
});

// A server-function filter names no `/_flare/fn` path, so it holds under any basePath.
it("kind", () => {
	expect(enters({ kind: ["serverFn"] }, { path: "/app/_flare/fn/abc", kind: "serverFn" })).toBe(true);
	expect(enters({ kind: ["serverFn"] }, page("/about"))).toBe(false);
	expect(enters({ kind: ["page"], prefix: ["/admin"] }, page("/admin"))).toBe(true);
	expect(enters({ kind: ["page"], prefix: ["/admin"] }, { path: "/admin", kind: "serverFn" })).toBe(false);
	// All omitted is every request.
	expect(enters({}, { path: "/x", kind: "serverFn" })).toBe(true);
});
