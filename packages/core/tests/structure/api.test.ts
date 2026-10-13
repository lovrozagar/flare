import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { packCore, type Packed } from "../../../../scripts/release.ts";

// Each public entry's packed `.d.ts` is the API an app compiles against. A change to it is a commit of its own.
let packed: Packed;

beforeAll(() => {
	packed = packCore();
}, 240_000);

afterAll(() => packed?.close());

it("snapshot", async () => {
	const exports: Record<string, unknown> = Object(Reflect.get(packed.manifest, "exports"));
	const entries = Object.entries(exports).filter(([key, value]) => typeof value === "object" && !key.includes("*"));
	expect(entries.length).toBeGreaterThan(10);
	for (const [, value] of entries) {
		const types = String(Reflect.get(Object(value), "types"));
		const name = basename(types, ".d.ts");
		await expect(readFileSync(join(packed.root, types), "utf8")).toMatchFileSnapshot(`snapshots/${name}.txt`);
	}
});
