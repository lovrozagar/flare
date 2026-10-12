import { expect, it } from "vitest";
import { finalize } from "../lifecycle/finalize.ts";
import { policyHeaders } from "../lifecycle/policies.ts";
import { variantId } from "./variant.ts";

const at = (path: string): URL => new URL(`http://localhost${path}`);

// A document, its data response, and its prefetch are three URLs, so three entries (dx/cache.md).
it("three urls", () => {
	const ids = ["/a", "/a?_flare=data", "/a?_flare=prefetch"].map((path) => variantId(at(path)));
	expect(new Set(ids).size).toBe(3);
	expect(ids).toEqual(["document:/a", "data:/a", "prefetch:/a"]);
});

it("user search stays", () => {
	const id = variantId(at("/a?q=1&_flare=data&_flare_stale=x"));
	expect(id).toBe("data:/a?q=1");
	expect(id).not.toContain("_flare");
	expect(variantId(at("/a?_flare=bad"))).toBeUndefined();
});

// Variants are URLs, not headers: nothing Flare finalizes carries Vary.
it("no vary", () => {
	expect(finalize({ status: 200, body: "", url: "http://localhost/a" }).headers.has("vary")).toBe(false);
	const decisions = [
		{ policy: "shared", class: "public", cdn: { maxAge: "60s", tags: ["a"] } },
		{ policy: "private", cdn: {} },
		{ policy: "no-store", cdn: {} },
	] as const;
	for (const decision of decisions) {
		expect(policyHeaders(decision, { status: 200, params: {} }).has("vary")).toBe(false);
	}
});
