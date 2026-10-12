import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { fileAssets } from "./assets.ts";

let root = "";

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "flare-assets-"));
	await writeFile(join(root, "a.txt"), "bytes");
	await mkdir(join(root, "dir"));
	await writeFile(join(root, "_root_%2Fabout.json"), "seed");
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

const text = (bytes: Uint8Array | null): string | null => (bytes === null ? null : new TextDecoder().decode(bytes));

// A path inside the root, as an artifact path names it, is read by its literal name.
it("inside", async () => {
	expect(text(await fileAssets(root)("/a.txt"))).toBe("bytes");
	expect(text(await fileAssets(root)("a.txt"))).toBe("bytes");
	expect(text(await fileAssets(root)("/_root_%2Fabout.json"))).toBe("seed");
});

it("missing", async () => {
	expect(await fileAssets(root)("/nope.txt")).toBeNull();
	expect(await fileAssets(root)("/dir")).toBeNull();
	expect(await fileAssets(root)("/a.txt/inner")).toBeNull();
	// A malformed escape is read by its literal name.
	expect(await fileAssets(root)("/%E0%A4%A")).toBeNull();
});

// Any other read failure is the caller's: a 500, not a quiet miss.
it("unreadable", async () => {
	await writeFile(join(root, "locked.txt"), "x");
	await chmod(join(root, "locked.txt"), 0o000);
	await expect(fileAssets(root)("/locked.txt")).rejects.toThrow(/EACCES/);
	await chmod(join(root, "locked.txt"), 0o644);
});

// A path that escapes the root, raw or after decoding, throws.
it("escape", async () => {
	await expect(fileAssets(root)("/../secret")).rejects.toThrow(/escapes/);
	await expect(fileAssets(root)("/%2e%2e/secret")).rejects.toThrow(/escapes/);
	await expect(fileAssets(root)("/a/%2E%2E/%2e%2e/secret")).rejects.toThrow(/escapes/);
});
