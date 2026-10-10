import { afterEach, describe, expect, it, vi } from "vitest";
import { setBuildId } from "../../../src/build-id.ts";
import { BuildMismatchError } from "../../../src/errors/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";

function ndjson(lines: unknown[], headers: Record<string, string> = {}): Response {
	return new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), {
		headers: { "content-type": "application/x-ndjson", ...headers },
	});
}

afterEach(() => {
	setBuildId(undefined);
	vi.unstubAllGlobals();
});

describe("fetchNDJSON — build mismatch", () => {
	it("rejects with BuildMismatchError on a t:b frame", async () => {
		setBuildId("old");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjson([{ b: "new", t: "b" }])));

		const result = fetchNDJSON({ url: "/pricing" });

		await expect(result).rejects.toBeInstanceOf(BuildMismatchError);
		await expect(result).rejects.toMatchObject({ serverBuildId: "new" });
	});

	it("rejects when the response build header differs, even without the frame", async () => {
		setBuildId("old");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(ndjson([{ d: { x: 1 }, m: "a", t: "l" }, { t: "d" }], { "flare-build": "new" })),
		);

		await expect(fetchNDJSON({ url: "/pricing" })).rejects.toBeInstanceOf(BuildMismatchError);
	});

	it("accepts a matching build header", async () => {
		setBuildId("same");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(ndjson([{ d: { x: 1 }, m: "a", t: "l" }, { t: "d" }], { "flare-build": "same" })),
		);

		const result = await fetchNDJSON({ url: "/pricing" });
		expect(result.matches[0]?.loaderData).toEqual({ x: 1 });
	});

	it("ignores the header when the page carried no build id", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(ndjson([{ d: { x: 1 }, m: "a", t: "l" }, { t: "d" }], { "flare-build": "new" })),
		);

		const result = await fetchNDJSON({ url: "/pricing" });
		expect(result.matches[0]?.loaderData).toEqual({ x: 1 });
	});
});

describe("isBuildMismatchError", () => {
	it("recognizes the error by name, including across realms", async () => {
		const { isBuildMismatchError } = await import("../../../src/errors/index.ts");
		expect(isBuildMismatchError(new BuildMismatchError("x"))).toBe(true);
		expect(isBuildMismatchError(Object.assign(new Error("m"), { name: "BuildMismatchError" }))).toBe(true);
		expect(isBuildMismatchError(new Error("other"))).toBe(false);
	});
});
