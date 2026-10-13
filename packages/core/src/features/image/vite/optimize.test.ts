import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parseOptions } from "../../../vite/plugin/options.ts";
import { withQuality } from "../shared/image.tsx";
import { imageEndpoint } from "./dev-endpoint.ts";
import { encodeVariant, imagePlugin, type ImageSettings } from "./optimize.ts";

const root = mkdtempSync(join(tmpdir(), "flare-image-"));
const png = join(root, "src", "a.png");
const settings: ImageSettings = { widths: [320, 640, 1280], quality: 75 };

beforeAll(async () => {
	mkdirSync(join(root, "src"), { recursive: true });
	const pixels = { create: { width: 1000, height: 500, channels: 3 as const, background: "#c04" } };
	await sharp(pixels).png().toFile(png);
	await sharp(pixels)
		.webp({ quality: 100 })
		.toFile(join(root, "src", "b.webp"));
	writeFileSync(join(root, "src", "c.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
	writeFileSync(join(root, "src", "d.gif"), "GIF89a");
	await sharp({ create: { width: 100, height: 50, channels: 3, background: "#0a0" } })
		.png()
		.toFile(join(root, "src", "tiny.png"));
	// Noise, so a lower quality makes fewer bytes.
	const noise = Buffer.from(Array.from({ length: 400 * 200 * 3 }, (_, index) => (index * 7919) % 251));
	await sharp(noise, { raw: { width: 400, height: 200, channels: 3 } })
		.png()
		.toFile(join(root, "src", "n.png"));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

type Emitted = { fileName: string; source: Uint8Array };

// The plugin's load hook, as an environment of a dev server or a build calls it.
async function load(id: string, at: { env?: string; command: "serve" | "build"; with?: ImageSettings }) {
	const plugin = imagePlugin(at.with ?? settings, "/assets");
	const configResolved = plugin.configResolved;
	if (typeof configResolved !== "function") throw new Error("configResolved");
	Reflect.apply(configResolved, {}, [{ base: "/", root }]);
	const emitted: Emitted[] = [];
	const context = {
		environment: { name: at.env ?? "client", config: { command: at.command } },
		emitFile: (file: Emitted) => void emitted.push(file),
	};
	const hook = plugin.load;
	if (typeof hook !== "function") throw new Error("load");
	const code: unknown = await Reflect.apply(hook, context, [id]);
	const binding: unknown =
		typeof code === "string" && code.startsWith("export default ")
			? JSON.parse(code.slice("export default ".length).trim().replace(/;$/, ""))
			: null;
	return { code, binding, emitted };
}

it("configured", async () => {
	const bytes = await encodeVariant(png, 320, settings);
	expect(await sharp(bytes).metadata()).toMatchObject({ width: 320, format: "webp" });
});

it("other width", async () => {
	await expect(encodeVariant(png, 321, settings)).rejects.toThrow("image width 321 is not configured");
});

it("svg", async () => {
	expect((await load(join(root, "src", "c.svg"), { command: "build" })).code).toBeNull();
});

it("gif", async () => {
	expect((await load(join(root, "src", "d.gif"), { command: "build" })).code).toBeNull();
});

it("prod name", async () => {
	const { emitted } = await load(png, { command: "build" });
	const at640 = emitted.find((file) => file.fileName.includes("-640-"));
	if (at640 === undefined) throw new Error("no 640 variant");
	const hash = createHash("sha256").update(at640.source).digest("hex").slice(0, 8);
	expect(at640.fileName).toBe(`assets/a-640-${hash}.webp`);
});

it("dev url", async () => {
	const { binding, emitted } = await load(png, { command: "serve" });
	expect(binding).toMatchObject({
		variants: [{ width: 320 }, { width: 640, src: "/_flare/image?src=/src/a.png&w=640" }],
	});
	expect(emitted).toEqual([]);
	expect(withQuality("/_flare/image?src=/src/a.png&w=640", 80, true)).toBe("/_flare/image?src=/src/a.png&w=640&q=80");
	expect(withQuality("/_flare/image?src=/src/a.png&w=640", 75, true)).toBe("/_flare/image?src=/src/a.png&w=640");
});

it("quality", () => {
	expect(() => parseOptions({ image: { quality: 0 } })).toThrow("image.quality");
	expect(() => parseOptions({ image: { quality: 75.5 } })).toThrow("image.quality");
	expect(parseOptions({ image: {} }).image?.quality).toBe(75);
	expect(() => parseOptions({ image: { widths: [5000] } })).toThrow("image.widths");
	expect(() => parseOptions({ image: { widths: [640, 640] } })).toThrow("image.widths");
	expect(() => parseOptions({ image: { exclude: "x" as unknown as RegExp } })).toThrow("image.exclude");
	expect(parseOptions({ image: { widths: [320], quality: 50, exclude: /x/ } }).image).toEqual({
		widths: [320],
		quality: 50,
		exclude: /x/,
	});
});

it("exclude", async () => {
	const excluded = { ...settings, exclude: /^src\/a\.png$/ };
	expect((await load(png, { command: "build", with: excluded })).code).toBeNull();
	// An import with a query asks for something else, such as `?url`. A file outside the project, and a virtual
	// module, are not app images.
	expect((await load(`${png}?url`, { command: "build" })).code).toBeNull();
	expect((await load(join(tmpdir(), "outside.png"), { command: "build" })).code).toBeNull();
	expect((await load("\0virtual.png", { command: "build" })).code).toBeNull();
});

it("binding", async () => {
	const client = await load(png, { command: "build" });
	expect(client.binding).toEqual({
		src: expect.stringMatching(/^\/assets\/a-640-[0-9a-f]{8}\.webp$/),
		width: 1000,
		height: 500,
		variants: [
			{ width: 320, src: expect.stringMatching(/^\/assets\/a-320-[0-9a-f]{8}\.webp$/) },
			{ width: 640, src: expect.stringMatching(/^\/assets\/a-640-[0-9a-f]{8}\.webp$/) },
		],
	});
	expect(client.emitted.map((file) => file.fileName.split("-")[1])).toEqual(["320", "640"]);
	// The server build references the same files and emits none.
	const server = await load(png, { env: "ssr", command: "build" });
	expect(server.binding).toEqual(client.binding);
	expect(server.emitted).toEqual([]);
	// The plugin config replaces config.ts with the app's widths and quality.
	const config = await load(join(import.meta.dirname, "..", "shared", "config.ts"), { command: "build" });
	expect(config.code).toBe("export const imageWidths = [320,640,1280];\nexport const imageQuality = 75;\n");
});

// An image narrower than every configured width has no variant: dev serves the file, a build emits it as it is.
it("no variant", async () => {
	const tiny = join(root, "src", "tiny.png");
	expect((await load(tiny, { command: "serve" })).binding).toEqual({
		src: "/src/tiny.png",
		width: 100,
		height: 50,
		variants: [],
	});
	const built = await load(tiny, { command: "build" });
	expect(built.binding).toMatchObject({
		src: expect.stringMatching(/^\/assets\/tiny-[0-9a-f]{8}\.png$/),
		variants: [],
	});
	expect(Buffer.from(built.emitted[0]?.source ?? []).equals(readFileSync(tiny))).toBe(true);
	expect((await load(tiny, { env: "ssr", command: "build" })).emitted).toEqual([]);
});

it("webp", async () => {
	const source = readFileSync(join(root, "src", "b.webp"));
	const { emitted } = await load(join(root, "src", "b.webp"), { command: "build" });
	const at320 = emitted.find((file) => file.fileName.includes("-320-"));
	expect(at320?.source).toBeDefined();
	expect(Buffer.from(at320?.source ?? []).equals(source)).toBe(false);
	expect(await sharp(at320?.source).metadata()).toMatchObject({ width: 320, format: "webp" });
});

it("missing", async () => {
	const handle = imageEndpoint(settings, { root }).handle;
	const at = (query: string): Promise<Response> => Promise.resolve(handle(new Request(`http://localhost/?${query}`)));
	expect((await at("src=/src/none.png&w=320")).status).toBe(404);
	expect((await at("src=/src/a.png&w=320&q=0")).status).toBe(400);
	expect((await at("src=/src/a.png&w=321")).status).toBe(400);
	expect((await at("src=/../../etc/passwd&w=320")).status).toBe(400);
	expect((await at("w=320")).status).toBe(400);
});

it("dev q", async () => {
	const handle = imageEndpoint(settings, { root }).handle;
	const noisy = join(root, "src", "n.png");
	const plain = await (await handle(new Request("http://localhost/?src=/src/n.png&w=320"))).arrayBuffer();
	const low = await (await handle(new Request("http://localhost/?src=/src/n.png&w=320&q=10"))).arrayBuffer();
	expect(low.byteLength).toBeLessThan(plain.byteLength);
	// Production bytes are the plugin quality, whatever a component asks for.
	expect(Buffer.from(await encodeVariant(noisy, 320, settings)).equals(Buffer.from(plain))).toBe(true);
});
