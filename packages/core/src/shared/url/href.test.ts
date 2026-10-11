import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildUrl, href } from "./href.ts";

const corpus = readFileSync(new URL("./href.corpus.txt", import.meta.url), "utf8");
const users = "_root_/users/[id]";

function row(name: string): string {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? "";
	return line.slice(name.length + 1).replaceAll("\\u0001", "\u0001");
}

it("relative", () => {
	expect(href(row("relative"))).toBe("/about");
	expect(href("https://ex.com/a")).toBe("https://ex.com/a");
	expect(href("http://ex.com/a")).toBe("http://ex.com/a");
	expect(() => href("//evil.com/a")).toThrow(/href/);
});

it("javascript", () => {
	expect(() => href(row("javascript"))).toThrow(/href/);
	expect(() => href("blob:hi")).toThrow(/href/);
	expect(() => href("vbscript:msg")).toThrow(/href/);
});

it("whitespace scheme", () => {
	expect(() => href(row("whitespace scheme"))).toThrow(/href/);
});

it("data", () => {
	expect(() => href(row("data"))).toThrow(/href/);
});

it("control prefix", () => {
	expect(() => href(row("control prefix"))).toThrow(/href/);
});

it("missing param", () => {
	expect(() => buildUrl({ to: users })).toThrow(/id/);
});

it("raw slash", () => {
	expect(() => buildUrl({ to: users, params: { id: "a/b" } })).toThrow(/param/);
	expect(() => buildUrl({ to: users, params: { id: "a\\b" } })).toThrow(/param/);
});

it("bad percent", () => {
	expect(() => buildUrl({ to: users, params: { id: "%ZZ" } })).toThrow(/param/);
	expect(() => buildUrl({ to: users, params: { id: "a%" } })).toThrow(/param/);
	expect(() => buildUrl({ to: users, params: { id: "%2" } })).toThrow(/param/);
});

it("no double encode", () => {
	const url = buildUrl({ to: users, params: { id: "a%2Fb" } });
	expect(url).toBe("/users/a%2Fb");
	expect(url.match(/%2F/g)).toHaveLength(1);
	const lower = buildUrl({ to: users, params: { id: "a%2fb" } });
	expect(lower).toBe("/users/a%2Fb");
	expect(lower.match(/%2F/g)).toHaveLength(1);
	expect(lower.includes("%2f")).toBe(false);
});
