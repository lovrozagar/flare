import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { guardDev } from "../../../vite/dev/index.ts";
import { imageEndpoint } from "./dev-endpoint.ts";

const root = mkdtempSync(join(tmpdir(), "flare-image-endpoint-"));
const endpoint = imageEndpoint({ widths: [320, 640], quality: 75 }, { root });

beforeAll(async () => {
	mkdirSync(join(root, "src"), { recursive: true });
	await sharp({ create: { width: 800, height: 400, channels: 3, background: "#08f" } })
		.png()
		.toFile(join(root, "src", "a.png"));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function get(query: string, headers: Record<string, string> = {}): Promise<Response> {
	return guardDev(endpoint.handle)(new Request(`http://localhost/_flare/image?${query}`, { headers }));
}

it("inside root", async () => {
	const response = await get("src=/src/a.png&w=320");
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("image/webp");
	expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 320 });
	expect(endpoint.path).toBe("/_flare/image");
});

it("escape", async () => {
	expect((await get("src=../../etc/passwd&w=320")).status).toBe(400);
	expect((await get("src=/src/../../etc/passwd&w=320")).status).toBe(400);
});

it("bad width", async () => {
	expect((await get("src=/src/a.png&w=321")).status).toBe(400);
	expect((await get("src=/src/a.png&w=abc")).status).toBe(400);
});

it("guard", async () => {
	expect((await get("src=/src/a.png&w=320", { "sec-fetch-site": "cross-site" })).status).toBe(403);
});
