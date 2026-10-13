import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { canonicalPath, type CanonicalOptions } from "./canonical.ts";

const corpus = readFileSync(new URL("./canonical.corpus.txt", import.meta.url), "utf8");

function row(name: string): string {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? "";
	return line.slice(name.length + 1).replaceAll("\\u0000", "\u0000");
}

function path(name: string, options?: CanonicalOptions): string {
	const result = canonicalPath(row(name), options);
	if ("hostile" in result) throw new Error(name);
	return result.path;
}

it("empty segments", () => {
	expect(path("empty segments")).toBe("/a/b");
});

it("trailing slash preserve", () => {
	expect(path("trailing slash preserve", { trailingSlash: "preserve" })).toBe("/a/");
	expect(canonicalPath("/", { trailingSlash: "preserve" })).toEqual({ path: "/" });
});

it("trailing slash never", () => {
	expect(path("trailing slash never", { trailingSlash: "never" })).toBe("/a");
	expect(canonicalPath("/", { trailingSlash: "never" })).toEqual({ path: "/" });
	expect(canonicalPath("/a", { trailingSlash: "never" })).toEqual({ path: "/a" });
});

// canonicalPath alone does not fold case. The fold uses the matched route (canonical-redirect.test.ts).
it("case fold", () => {
	expect(path("case fold")).toBe("/About");
	expect(canonicalPath("/%C4%8D/About/")).toEqual({ path: "/%C4%8D/About/" });
});

it("scheme-relative", () => {
	expect(canonicalPath(row("scheme-relative"))).toEqual({ hostile: true });
});

it("backslash", () => {
	expect(canonicalPath(row("backslash"))).toEqual({ hostile: true });
});

it("encoded slashes", () => {
	expect(canonicalPath(row("encoded slashes"))).toEqual({ hostile: true });
});

it("dot dot", () => {
	expect(path("dot dot")).toBe("/b");
	expect(canonicalPath(row("dot dot encoded"))).toEqual({ hostile: true });
});

it("control and NUL", () => {
	expect(canonicalPath(row("control and NUL"))).toEqual({ hostile: true });
	expect(canonicalPath("/a\u001f")).toEqual({ hostile: true });
});

it("base path", () => {
	expect(path("base path", { basePath: "/app" })).toBe("/");
	expect(canonicalPath("/app", { basePath: "/app", trailingSlash: "always" })).toEqual({ path: "/" });
	expect(canonicalPath("/app/about", { basePath: "/app" })).toEqual({ path: "/app/about" });
});
