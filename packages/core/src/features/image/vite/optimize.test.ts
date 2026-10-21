import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, expect, it } from "vitest"
import { parseOptions } from "../../../vite/plugin/options.ts"
import { withQuality } from "../shared/image.tsx"
import { imageEndpoint } from "./dev-endpoint.ts"
import { encodeVariant, imagePlugin, intrinsicSize, type ImageSettings } from "./optimize.ts"

const root = mkdtempSync(join(tmpdir(), "flare-image-"))
const png = join(root, "src", "a.png")
const settings: ImageSettings = { widths: [320, 640, 1280], quality: 75 }

beforeAll(async () => {
	mkdirSync(join(root, "src"), { recursive: true })
	const pixels = { create: { width: 1000, height: 500, channels: 3 as const, background: "#c04" } }
	await sharp(pixels).png().toFile(png)
	await sharp(pixels)
		.webp({ quality: 100 })
		.toFile(join(root, "src", "b.webp"))
	writeFileSync(join(root, "src", "c.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>")
	writeFileSync(join(root, "src", "d.gif"), "GIF89a")
	await sharp({ create: { width: 100, height: 50, channels: 3, background: "#0a0" } })
		.png()
		.toFile(join(root, "src", "tiny.png"))
	await sharp({ create: { width: 100, height: 60, channels: 3, background: "#0a0" } })
		.tiff()
		.toFile(join(root, "src", "tiny.tiff"))
	// Names a URL query would cut or change, and one that starts with `..` inside the project.
	for (const name of ["a+b.png", "c&d.png", "e#f.png", "..hero.png", "50%.png", "a b,c.png"])
		writeFileSync(join(root, "src", name), readFileSync(png))
	// A phone photo: stored 1000x500, with EXIF orientation 6, so it shows 500x1000, upright.
	await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#04c" } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toFile(join(root, "src", "phone.jpg"))
	// Noise, so a lower quality makes fewer bytes.
	const noise = Buffer.from(Array.from({ length: 400 * 200 * 3 }, (_, index) => (index * 7919) % 251))
	await sharp(noise, { raw: { width: 400, height: 200, channels: 3 } })
		.png()
		.toFile(join(root, "src", "n.png"))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

type Emitted = { fileName: string; source: Uint8Array }

// The plugin's load hook, as an environment of a dev server or a build calls it.
async function load(id: string, at: { env?: string; command: "serve" | "build"; with?: ImageSettings }) {
	const plugin = imagePlugin(at.with ?? settings, "/assets")
	const configResolved = plugin.configResolved
	if (typeof configResolved !== "function") throw new Error("configResolved")
	Reflect.apply(configResolved, {}, [{ base: "/", root }])
	const emitted: Emitted[] = []
	const context = {
		environment: { name: at.env ?? "client", config: { command: at.command } },
		emitFile: (file: Emitted) => void emitted.push(file),
	}
	const hook = plugin.load
	if (typeof hook !== "function") throw new Error("load")
	const code: unknown = await Reflect.apply(hook, context, [id])
	const binding: unknown =
		typeof code === "string" && code.startsWith("export default ")
			? JSON.parse(code.slice("export default ".length).trim().replace(/;$/, ""))
			: null
	return { code, binding, emitted }
}

it("configured", async () => {
	const bytes = await encodeVariant(png, 320, settings)
	expect(await sharp(bytes).metadata()).toMatchObject({ width: 320, format: "webp" })
})

// An image's EXIF orientation is applied: its size and every variant are upright, as a browser shows the original, and
// the variant carries no orientation for a viewer to apply twice (plan 21 3.16).
it("exif orientation", async () => {
	const phone = join(root, "src", "phone.jpg")
	expect(await intrinsicSize(phone)).toEqual({ width: 500, height: 1000 })
	const meta = await sharp(await encodeVariant(phone, 320, settings)).metadata()
	expect([meta.width, meta.height, meta.orientation]).toEqual([320, 640, undefined])
	const handle = imageEndpoint(settings, { root }).handle
	const answer = await handle(new Request("http://localhost/_flare/image?src=/src/phone.jpg&w=320"))
	const shown = await sharp(new Uint8Array(await answer.arrayBuffer())).metadata()
	expect([shown.width, shown.height]).toEqual([320, 640])
})

it("other width", async () => {
	await expect(encodeVariant(png, 321, settings)).rejects.toThrow("image width 321 is not configured")
})

it("svg", async () => {
	expect((await load(join(root, "src", "c.svg?image"), { command: "build" })).code).toBeNull()
	expect((await load(join(root, "src", "c.svg"), { command: "build" })).code).toBeNull()
})

it("gif", async () => {
	expect((await load(join(root, "src", "d.gif?image"), { command: "build" })).code).toBeNull()
})

it("prod name", async () => {
	const { emitted } = await load(`${png}?image`, { command: "build" })
	const at640 = emitted.find((file) => file.fileName.includes("-640-"))
	if (at640 === undefined) throw new Error("no 640 variant")
	const hash = createHash("sha256").update(at640.source).digest("hex").slice(0, 8)
	expect(at640.fileName).toBe(`assets/a-640-${hash}.webp`)
})

it("dev url", async () => {
	const { binding, emitted } = await load(`${png}?image`, { command: "serve" })
	expect(binding).toMatchObject({
		variants: [{ width: 320 }, { width: 640, src: "/_flare/image?src=/src/a.png&w=640" }],
	})
	expect(emitted).toEqual([])
	expect(withQuality("/_flare/image?src=/src/a.png&w=640", 80, true)).toBe("/_flare/image?src=/src/a.png&w=640&q=80")
	expect(withQuality("/_flare/image?src=/src/a.png&w=640", 75, true)).toBe("/_flare/image?src=/src/a.png&w=640")
})

it("quality", () => {
	expect(() => parseOptions({ image: { quality: 0 } })).toThrow("image.quality")
	expect(() => parseOptions({ image: { quality: 75.5 } })).toThrow("image.quality")
	expect(parseOptions({ image: {} }).image?.quality).toBe(75)
	expect(() => parseOptions({ image: { widths: [5000] } })).toThrow("image.widths")
	expect(() => parseOptions({ image: { widths: [640, 640] } })).toThrow("image.widths")
	expect(() => parseOptions({ image: { exclude: "x" as unknown as RegExp } })).toThrow("image.exclude")
	expect(parseOptions({ image: { widths: [320], quality: 50, exclude: /x/ } }).image).toEqual({
		widths: [320],
		quality: 50,
		exclude: /x/,
	})
})

it("exclude", async () => {
	const excluded = { ...settings, exclude: /^src\/a\.png$/ }
	expect((await load(`${png}?image`, { command: "build", with: excluded })).code).toBeNull()
	// Only `?image` opts in. A plain import, another query, and a query beyond `?image` stay Vite's. A file outside the
	// project, and a virtual module, are not app images.
	for (const id of [png, `${png}?url`, `${png}?url&image`, `${png}?image&w=320`, `${png}?a?image`])
		expect((await load(id, { command: "build" })).code).toBeNull()
	expect((await load("\0virtual.png?image", { command: "build" })).code).toBeNull()
	// A `?image` import outside the project is a build error, not Vite's plain URL (BUGS.md 455).
	const outside = join(tmpdir(), "outside.png")
	await expect(load(`${outside}?image`, { command: "build" })).rejects.toThrow(
		`${outside}?image is outside the project root`,
	)
})

it("binding", async () => {
	const client = await load(`${png}?image`, { command: "build" })
	expect(client.binding).toEqual({
		src: expect.stringMatching(/^\/assets\/a-640-[0-9a-f]{8}\.webp$/),
		width: 1000,
		height: 500,
		variants: [
			{ width: 320, src: expect.stringMatching(/^\/assets\/a-320-[0-9a-f]{8}\.webp$/) },
			{ width: 640, src: expect.stringMatching(/^\/assets\/a-640-[0-9a-f]{8}\.webp$/) },
		],
	})
	expect(client.emitted.map((file) => file.fileName.split("-")[1])).toEqual(["320", "640"])
	// The server build references the same files and emits none.
	const server = await load(`${png}?image`, { env: "ssr", command: "build" })
	expect(server.binding).toEqual(client.binding)
	expect(server.emitted).toEqual([])
	// The plugin config replaces config.ts with the app's widths and quality.
	const config = await load(join(import.meta.dirname, "..", "shared", "config.ts"), { command: "build" })
	expect(config.code).toBe(
		"export const imageWidths = [320,640,1280];\nexport const imageQuality = 75;\nexport const imageConfigured = true;\n",
	)
})

// An image narrower than every configured width has one variant at its own width, a webp like any other: dev points
// at the endpoint, which takes that width for that file only, and a build emits it. A TIFF then displays (BUGS.md 454).
it("no variant", async () => {
	const tiny = join(root, "src", "tiny.png")
	const dev = "/_flare/image?src=/src/tiny.png&w=100"
	expect((await load(`${tiny}?image`, { command: "serve" })).binding).toEqual({
		src: dev,
		width: 100,
		height: 50,
		variants: [{ width: 100, src: dev }],
	})
	const handle = imageEndpoint(settings, { root }).handle
	const served = await handle(new Request(`http://localhost${dev}&q=80`))
	expect(served.status).toBe(200)
	expect(await sharp(Buffer.from(await served.arrayBuffer())).metadata()).toMatchObject({ width: 100, format: "webp" })
	for (const query of ["src=/src/tiny.png&w=99", "src=/src/tiny.png&w=50", "src=/src/a.png&w=100"])
		expect((await handle(new Request(`http://localhost/?${query}`))).status).toBe(400)
	for (const [name, width] of [
		["tiny.png", 100],
		["tiny.tiff", 100],
	] as const) {
		const built = await load(`${join(root, "src", name)}?image`, { command: "build" })
		const stem = name.split(".")[0] ?? ""
		expect(built.binding).toMatchObject({
			src: expect.stringMatching(new RegExp(`^/assets/${stem}-${width}-[0-9a-f]{8}\\.webp$`)),
			variants: [{ width }],
		})
		expect(await sharp(built.emitted[0]?.source).metadata()).toMatchObject({ width, format: "webp" })
	}
	expect((await load(`${tiny}?image`, { env: "ssr", command: "build" })).emitted).toEqual([])
	await expect(encodeVariant(png, 100, settings)).rejects.toThrow("image width 100 is not configured")
})

// A built variant's URL names its file percent-encoded, so `%`, a space, or a comma in the name reads back as that
// file (BUGS.md 432).
it("prod url names", async () => {
	for (const name of ["50%.png", "a b,c.png"]) {
		const { binding, emitted } = await load(`${join(root, "src", name)}?image`, { command: "build" })
		const src = (binding as { src: string }).src
		const file = emitted.find((item) => item.fileName.includes("-640-"))?.fileName ?? ""
		expect(decodeURIComponent(src.slice(src.lastIndexOf("/") + 1))).toBe(file.slice(file.lastIndexOf("/") + 1))
		expect(src).not.toMatch(/[\s,]|%(?![0-9A-F]{2})/)
	}
})

// A file name with `+`, `&`, or `#` reaches the endpoint as named (BUGS.md 456), and one that starts with `..` is in
// the project (BUGS.md 457).
it("dev url names", async () => {
	const handle = imageEndpoint(settings, { root }).handle
	for (const name of ["a+b.png", "c&d.png", "e#f.png", "..hero.png"]) {
		const { binding } = await load(`${join(root, "src", name)}?image`, { command: "serve" })
		const src = (binding as { src: string }).src
		expect(new URL(src, "http://localhost").searchParams.get("src")).toBe(`/src/${name}`)
		expect((await handle(new Request(`http://localhost${src}`))).status).toBe(200)
	}
})

it("webp", async () => {
	const source = readFileSync(join(root, "src", "b.webp"))
	const { emitted } = await load(join(root, "src", "b.webp?image"), { command: "build" })
	const at320 = emitted.find((file) => file.fileName.includes("-320-"))
	expect(at320?.source).toBeDefined()
	expect(Buffer.from(at320?.source ?? []).equals(source)).toBe(false)
	expect(await sharp(at320?.source).metadata()).toMatchObject({ width: 320, format: "webp" })
})

it("missing", async () => {
	const handle = imageEndpoint(settings, { root }).handle
	const at = (query: string): Promise<Response> => Promise.resolve(handle(new Request(`http://localhost/?${query}`)))
	expect((await at("src=/src/none.png&w=320")).status).toBe(404)
	expect((await at("src=/src/a.png&w=320&q=0")).status).toBe(400)
	expect((await at("src=/src/a.png&w=321")).status).toBe(400)
	expect((await at("src=/../../etc/passwd&w=320")).status).toBe(400)
	expect((await at("w=320")).status).toBe(400)
})

it("dev q", async () => {
	const handle = imageEndpoint(settings, { root }).handle
	const noisy = join(root, "src", "n.png")
	const plain = await (await handle(new Request("http://localhost/?src=/src/n.png&w=320"))).arrayBuffer()
	const low = await (await handle(new Request("http://localhost/?src=/src/n.png&w=320&q=10"))).arrayBuffer()
	expect(low.byteLength).toBeLessThan(plain.byteLength)
	// Production bytes are the plugin quality, whatever a component asks for.
	expect(Buffer.from(await encodeVariant(noisy, 320, settings)).equals(Buffer.from(plain))).toBe(true)
})
