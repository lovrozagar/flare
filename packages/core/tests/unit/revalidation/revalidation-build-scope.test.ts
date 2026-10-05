/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createRevalidateFn, revalidate } from "../../../src/revalidation/index.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { FlareStore } from "../../../src/store/index.ts";
import { keyToPath } from "../../../src/store/filesystem.ts";

function makeStore(): FlareStore & { delete: ReturnType<typeof vi.fn> } {
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
	};
}

describe("revalidation — build-scoped static keys", () => {
	it("maps user-facing static:/path keys to the current build; other keys pass through", async () => {
		const store = makeStore();
		await createRevalidateFn({ buildId: "b1", store })({
			keys: ["static:/about", "static:b0:/old", "flare:_root_/x"],
			tiers: ["ssr"],
		});

		expect(store.delete.mock.calls.map((c) => c[0])).toEqual(["static:b1:/about", "static:b0:/old", "flare:_root_/x"]);
	});

	it("CDN purges receive the keys as the user wrote them", async () => {
		const purgeByKeys = vi.fn(async () => {});
		await createRevalidateFn({ buildId: "b1", cdnPurgeAdapter: { purgeByKeys, purgeByTags: vi.fn() } })({
			keys: ["static:/about"],
			tiers: ["cdn"],
		});

		expect(purgeByKeys).toHaveBeenCalledWith(["static:/about"], undefined);
	});

	it("revalidate() in request scope uses the request's build", async () => {
		const store = makeStore();
		await runWithServerContext(
			{ buildId: "b9", isDev: false, nonce: "n", request: new Request("http://localhost/"), store },
			() => revalidate({ keys: ["static:/pricing"], tiers: ["ssr"] }),
		);

		expect(store.delete).toHaveBeenCalledWith("static:b9:/pricing");
	});
});

describe("filesystem store — build-scoped keys", () => {
	it("maps each build's entry to its own stable file", () => {
		expect(keyToPath("static:abc:/about")).toBe("static/abc___about.json");
		expect(keyToPath("static:abc:/about")).toBe(keyToPath("static:abc:/about"));
		expect(keyToPath("static:def:/about")).not.toBe(keyToPath("static:abc:/about"));
	});
});
