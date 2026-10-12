import { expect, it } from "vitest";
import { fnPrefix, readInternal, staleList } from "./internal-params.ts";

it("absent", () => {
	const read = readInternal(new URL("http://localhost/about?_flare_stale=page"));
	expect(read).toMatchObject({ status: 200, kind: "document", stale: null });
	if (read.status !== 200) throw new Error("status");
	expect(read.url.href).toBe("http://localhost/about");
});

it("data", () => {
	expect(readInternal(new URL("http://localhost/about?_flare=data"))).toMatchObject({ status: 200, kind: "data" });
});

it("prefetch", () => {
	expect(readInternal(new URL("http://localhost/about?_flare=prefetch"))).toMatchObject({
		status: 200,
		kind: "prefetch",
	});
});

it("other", () => {
	expect(readInternal(new URL("http://localhost/about?_flare=isr"))).toEqual({ status: 400 });
});

it("stripped", () => {
	const read = readInternal(new URL("http://localhost/about?q=1&_flare=data&_flare_stale=a%20b"));
	if (read.status !== 200) throw new Error("status");
	expect(read.url.search).toBe("?q=1");
	expect(read.stale).toBe("a b");
	expect(staleList(read.stale)).toEqual({ all: false, ids: new Set(["a", "b"]) });
	expect(staleList(null)).toBeNull();
});

it("stale cap", () => {
	const long = "p".repeat(8 * 1024 + 1);
	const read = readInternal(new URL(`http://localhost/?_flare=data&_flare_stale=${long}`));
	if (read.status !== 200) throw new Error("status");
	expect(staleList(read.stale)).toEqual({ all: true, ids: new Set() });
	expect(staleList("p".repeat(8 * 1024))?.all).toBe(false);
});

it("raw kept", () => {
	const read = readInternal(new URL("http://localhost/a?q=a%20b&x=~'!*()&b&_flare=data&_flare_stale=k"));
	if (read.status !== 200) throw new Error("status");
	expect(read.url.search).toBe("?q=a%20b&x=~%27!*()&b");
	const plain = new URL("http://localhost/a?q=a%20b&a=1&a=2&b&tag=c%2B%2B");
	const document = readInternal(plain);
	if (document.status !== 200) throw new Error("status");
	expect(document.url.href).toBe(plain.href);
	expect(document.url).not.toBe(plain);
});

it("fn prefix", () => {
	expect(fnPrefix("/")).toBe("/_flare/fn/");
	expect(fnPrefix("/app")).toBe("/app/_flare/fn/");
});
