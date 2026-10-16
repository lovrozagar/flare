import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, expect, it } from "vitest"
import { builtServer, fixtureApps, type Server } from "./vite-app.ts"

// dx/features.md's Image and Fonts rows through a real `vite build` and its built server (B96): each Image mode on a
// page of its own, and a createFont face with FontCSS in the root's head, read from the documents the server sends.

const apps = fixtureApps()
let server: Server

const ROOT = `import { createFont, createRootLayout, FontCSS } from "@lovrozagar/flare"
const mono = createFont({
	family: "Mono</style>X",
	src: "/fonts/mono.woff2",
	category: "monospace",
	weights: [400, 700],
	style: "italic",
	fallbackMetrics: { ascentOverride: "90%", descentOverride: "20%", lineGapOverride: "0%", sizeAdjust: "105%", fallbackFont: "Courier New" },
})
const plain = createFont({ family: "Plain", src: "/fonts/plain.woff2", category: "display" })
export const route = createRootLayout("_root_").render((props) => (
	<html>
		<head>
			<FontCSS font={mono} />
			<FontCSS font={plain} preload={false} subsets={["latin"]} />
		</head>
		<body data-mono={mono.fontFamily} data-plain={plain.fontFamily}>{props.children}</body>
	</html>
))
`

// A page at /<name> that renders one Image with `props`.
function imagePage(name: string, props: string): string {
	return `import { createPage, Image } from "@lovrozagar/flare"
import hero from "../../../assets/hero.png?image"
export const route = createPage("_root_/${name}").render(() => <Image src={hero} ${props} />)
`
}

const BLUR = "data:image/png;base64,iVBORw0KGgo="

beforeAll(async () => {
	const root = apps.make({
		"vite.config.mjs":
			'import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare({ image: { widths: [320, 640, 1280], quality: 50 } })] };\n',
		"src/routes/_root_/root.root-layout.tsx": ROOT,
		"src/routes/_root_/responsive/responsive.page.tsx": imagePage("responsive", 'alt="r" maxWidth={320} sizes="50vw"'),
		"src/routes/_root_/fixed/fixed.page.tsx": imagePage("fixed", 'alt="" fixed width={320} height={192} priority'),
		"src/routes/_root_/fill/fill.page.tsx": imagePage("fill", 'alt="f" fill'),
		"src/routes/_root_/blur/blur.page.tsx": imagePage(
			"blur",
			`alt="b" maxWidth={640} placeholder="blur" blurDataURL="${BLUR}"`,
		),
		"src/routes/_root_/narrow/narrow.page.tsx": imagePage(
			"narrow",
			'alt="n" maxWidth={640} widths={[320]} quality={30}',
		),
		"src/routes/_root_/boxed/boxed.page.tsx": imagePage("boxed", 'alt="x" maxWidth={640} maxHeight={200}'),
		"src/routes/_root_/ratio/ratio.page.tsx": imagePage("ratio", 'alt="q" maxWidth={640} aspectRatio={2}'),
	})
	mkdirSync(join(root, "src/assets"), { recursive: true })
	const png = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#3366cc" } })
		.png()
		.toBuffer()
	writeFileSync(join(root, "src/assets/hero.png"), png)
	server = await builtServer(root)
})

afterAll(() => apps.removeAll())

async function documentOf(path: string): Promise<string> {
	return (await server.fetch(new Request(`https://example.com${path}`))).text()
}

// The one img a page renders, as its attributes. A bare attribute, as Solid writes an empty `alt`, is "".
async function img(path: string): Promise<Record<string, string>> {
	const tag = /<img\b([^>]*)>/.exec(await documentOf(path))?.[1] ?? ""
	return Object.fromEntries([...tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] ?? ""]))
}

// A font's stack as the root writes it on body's `data-<name>`.
function stackOf(html: string, name: string): string | undefined {
	return new RegExp(`data-${name}="([^"]*)"`).exec(html)?.[1]?.replaceAll("&quot;", '"')
}

// The widths a srcset names, and its descriptors.
function described(srcset: string | undefined): string[] {
	return (srcset ?? "").split(", ").map((entry) => entry.replace(/^\S*-(\d+)-[0-9a-f]{8}\.webp/, "$1"))
}

// Responsive: `maxWidth` caps the box at 100% and the srcset at twice it, ascending; `sizes` passes through; lazy and
// async by default; `alt` is the attribute.
it("image responsive", async () => {
	const attributes = await img("/responsive")
	expect(described(attributes["srcset"])).toEqual(["320 320w", "640 640w"])
	expect(attributes).toMatchObject({ alt: "r", sizes: "50vw", loading: "lazy", decoding: "async" })
	expect(attributes["style"]).toMatch(/width:\s*100%/)
	expect(attributes["style"]).toMatch(/max-width:\s*320px/)
})

// Fixed: the width and height as pixels and attributes, a density srcset (2x when twice the width was built), and
// `priority` loads eagerly with high fetch priority.
it("image fixed", async () => {
	const attributes = await img("/fixed")
	expect(described(attributes["srcset"])).toEqual(["320 1x", "640 2x"])
	expect(attributes).toMatchObject({
		alt: "",
		width: "320",
		height: "192",
		loading: "eager",
		decoding: "sync",
		fetchpriority: "high",
	})
})

// Fill: absolutely placed over its box with the source's aspect ratio, and every generated width up to its 1000 px.
it("image fill", async () => {
	const attributes = await img("/fill")
	expect(described(attributes["srcset"])).toEqual(["320 320w", "640 640w"])
	expect(attributes["style"]).toMatch(/position:\s*absolute/)
	expect(attributes["style"]).toMatch(/object-fit:\s*cover/)
	expect(attributes["style"]).toMatch(/aspect-ratio:\s*1000 \/ 600/)
})

// Blur: the data URL is the cover background until load. Own widths narrow the srcset; a component `quality` leaves
// production bytes at the plugin's. `maxHeight` caps the box; `aspectRatio` sets a box missing a dimension.
it("image props", async () => {
	expect((await img("/blur"))["style"]).toContain(`background-image:url(&quot;${BLUR}&quot;);background-size:cover`)
	expect((await img("/ratio"))["style"]).toMatch(/aspect-ratio:\s*2(;|$)/)
	const narrow = await img("/narrow")
	expect(described(narrow["srcset"])).toEqual(["320 320w"])
	expect(narrow["src"]).not.toContain("q=")
	expect((await img("/boxed"))["style"]).toMatch(/max-height:\s*200px/)
})

// createFont: one face per weight, italic, swap, the family escaped, a metrics fallback face, and a stack by category;
// FontCSS preloads a createFont src unless `preload={false}`, and `subsets` leaves a one-file font's CSS alone.
it("fonts", async () => {
	const html = await documentOf("/responsive")
	const css = [...html.matchAll(/<style[^>]*>(.*?)<\/style>/gs)].map((match) => match[1]).join("\n")
	const mono = css.split("@font-face").filter((face) => face.includes("Mono") && !face.includes("Fallback"))
	expect(mono.map((face) => /font-weight:\s*(\d+)/.exec(face)?.[1])).toEqual(["400", "700"])
	expect(css).toMatch(/font-style:\s*italic/)
	expect(css).toMatch(/font-display:\s*swap/)
	expect(css).not.toContain("</style>X")
	expect(css).toMatch(/size-adjust:\s*105%/)
	expect(css).toContain("Fallback")
	expect(css).not.toContain("unicode-range")
	const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g)].map((match) => match[0])
	expect(preloads.filter((link) => link.includes("/fonts/mono.woff2"))).toHaveLength(1)
	expect(preloads.some((link) => link.includes("/fonts/plain.woff2"))).toBe(false)
	// The stack: the family, CSS-escaped, its metrics fallback, then the category's generic; `display` is sans-serif.
	expect(stackOf(html, "mono")).toBe('"Mono\\3C /style\\3E X", "Mono\\3C /style\\3E X Fallback", monospace')
	expect(stackOf(html, "plain")).toBe('"Plain", sans-serif')
})
