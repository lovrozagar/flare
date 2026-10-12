import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { idPattern } from "../route-tree/index.ts";
import { createRouter } from "../router/create-router.ts";
import { buildUrl, href } from "./href.ts";
import { writeUrl } from "./search.ts";

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

const ids = {
	group: "_root_/(blog)/post",
	admin: "_admin_/dashboard",
	site: "site/_root_/about",
	shop: "_shop_/cart",
	locale: "[locale]/_root_/about",
	bracket: "_root_/[_]id]",
	optional: "_root_/optional-locale/[[locale]]",
	files: "_root_/files/[...path]",
	maybeFiles: "_root_/maybe/[[...path]]",
};

it("group and root", () => {
	expect(buildUrl({ to: ids.group })).toBe("/post");
	expect(buildUrl({ to: ids.admin })).toBe("/dashboard");
	expect(buildUrl({ to: ids.site })).toBe("/about");
	expect(buildUrl({ to: ids.shop })).toBe("/cart");
});

it("param before root", () => {
	expect(buildUrl({ to: ids.locale, params: { locale: "en" } })).toBe("/en/about");
});

it("literal bracket", () => {
	expect(buildUrl({ to: ids.bracket })).toBe("/[id]");
});

it("optional", () => {
	expect(buildUrl({ to: ids.optional, params: { locale: "fr" } })).toBe("/optional-locale/fr");
	expect(buildUrl({ to: ids.optional })).toBe("/optional-locale");
});

it("catch-all", () => {
	expect(buildUrl({ to: ids.files, params: { path: ["a", "b c"] } })).toBe("/files/a/b%20c");
	expect(() => buildUrl({ to: ids.files, params: { path: ["a/b"] } })).toThrow(/param/);
	expect(() => buildUrl({ to: ids.files, params: { path: [] } })).toThrow(/path/);
	expect(buildUrl({ to: ids.maybeFiles, params: { path: [] } })).toBe("/maybe");
	expect(() => buildUrl({ to: users, params: { id: ["1", "2"] } })).toThrow(/id/);
});

it("round trip", () => {
	const rows: { to: string; params?: Record<string, string | string[]>; raw: Record<string, unknown> }[] = [
		{ to: ids.group, raw: {} },
		{ to: ids.locale, params: { locale: "en" }, raw: { locale: "en" } },
		{ to: ids.bracket, raw: {} },
		{ to: ids.optional, params: { locale: "fr" }, raw: { locale: "fr" } },
		{ to: ids.optional, raw: {} },
		{ to: ids.files, params: { path: ["a", "b c"] }, raw: { path: ["a", "b%20c"] } },
	];
	for (const row of rows) {
		const router = createRouter({ layouts: {}, routeTree: [{ id: row.to, path: idPattern(row.to), module: {} }] });
		const match = router.match(buildUrl({ to: row.to, params: row.params }));
		expect(match.id).toBe(row.to);
		expect(match.params).toEqual(row.raw);
	}
});

it("search and hash", () => {
	const search = { q: "a b" };
	expect(buildUrl({ to: users, params: { id: "7" }, search, hash: "top" })).toBe(
		writeUrl({ path: "/users/7", search, hash: "top" }),
	);
	expect(buildUrl({ to: users, params: { id: "7" }, hash: "#top" })).toBe("/users/7#top");
});
