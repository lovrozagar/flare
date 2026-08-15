import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageLoader, StaticImageData } from "../../../src/image/index.tsx";
import { configureImage, Image, resetImageConfig } from "../../../src/image/index.tsx";

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	resetImageConfig();
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
});

const testLoader: ImageLoader = ({ quality, src, width }) => `https://cdn.test/w${width}/q${quality}${src}`;

/* ── Responsive mode (default) ── */

describe("responsive mode", () => {
	it("renders img with maxWidth as width attr and computed height", () => {
		dispose = render(() => <Image alt="hero" maxHeight={800} maxWidth={1200} src="/hero.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBe("1200");
		expect(img?.getAttribute("height")).toBe("800");
	});

	it("computes height from aspectRatio", () => {
		dispose = render(() => <Image alt="wide" aspectRatio={16 / 9} maxWidth={1600} src="/wide.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBe("1600");
		expect(img?.getAttribute("height")).toBe("900");
	});

	it("auto-generates sizes: (min-width: Xpx) Xpx, 100vw", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("(min-width: 900px) 900px, 100vw");
	});

	it("user sizes override auto-generated", () => {
		dispose = render(
			() => (
				<Image alt="photo" maxHeight={600} maxWidth={900} sizes="(max-width: 768px) 100vw, 50vw" src="/photo.jpg" />
			),
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("(max-width: 768px) 100vw, 50vw");
	});

	it("generates width-descriptor srcset with loader", () => {
		dispose = render(
			() => <Image alt="photo" loader={testLoader} maxHeight={600} maxWidth={900} src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		for (const part of srcset.split(", ")) {
			expect(part).toMatch(/\d+w$/);
		}
		expect(srcset).not.toContain("1x");
	});

	it("applies fluid layout styles", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("max-width: 900px");
		expect(style).toContain("width: 100%");
		expect(style).toContain("aspect-ratio: 900 / 600");
	});

	it("aspectRatio sets aspect-ratio style", () => {
		dispose = render(() => <Image alt="wide" aspectRatio={16 / 9} maxWidth={1600} src="/wide.jpg" />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("aspect-ratio");
	});

	it("no maxHeight or aspectRatio — no aspect-ratio in style, warns", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		dispose = render(() => <Image alt="photo" maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).not.toContain("aspect-ratio");
		expect(style).toContain("max-width: 900px");
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("src passthrough without loader", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/photo.jpg");
		expect(img?.getAttribute("srcset")).toBeNull();
	});

	it("loader transforms src using maxWidth", () => {
		dispose = render(
			() => <Image alt="photo" loader={testLoader} maxHeight={600} maxWidth={900} src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("https://cdn.test/w900/q75/photo.jpg");
	});
});

/* ── Fixed mode ── */

describe("fixed mode", () => {
	it("renders with exact width/height attrs", () => {
		dispose = render(() => <Image alt="icon" fixed height={48} src="/icon.png" width={48} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBe("48");
		expect(img?.getAttribute("height")).toBe("48");
	});

	it("generates density srcset (1x/2x)", () => {
		dispose = render(
			() => <Image alt="icon" fixed height={48} loader={testLoader} src="/icon.png" width={48} />,
			container,
		);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toContain("1x");
		expect(srcset).toContain("2x");
	});

	it("auto sizes = widthpx", () => {
		dispose = render(() => <Image alt="icon" fixed height={48} src="/icon.png" width={48} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("48px");
	});

	it("applies exact CSS dimensions", () => {
		dispose = render(() => <Image alt="icon" fixed height={48} src="/icon.png" width={48} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("width: 48px");
		expect(style).toContain("height: 48px");
	});

	it("loader src uses exact width", () => {
		dispose = render(
			() => <Image alt="icon" fixed height={48} loader={testLoader} src="/icon.png" width={48} />,
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("https://cdn.test/w48/q75/icon.png");
	});
});

/* ── Fill mode ── */

describe("fill mode", () => {
	it("no width/height HTML attrs", () => {
		dispose = render(() => <Image alt="bg" fill src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBeNull();
		expect(img?.getAttribute("height")).toBeNull();
	});

	it("absolute positioning styles", () => {
		dispose = render(() => <Image alt="bg" fill src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("position: absolute");
		expect(style).toContain("inset: 0");
		expect(style).toContain("width: 100%");
		expect(style).toContain("height: 100%");
		expect(style).toContain("object-fit: cover");
	});

	it("auto sizes = 100vw", () => {
		dispose = render(() => <Image alt="bg" fill src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("100vw");
	});

	it("aspectRatio applied to fill", () => {
		dispose = render(() => <Image alt="bg" aspectRatio={16 / 9} fill src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("aspect-ratio");
	});

	it("width descriptors with uncapped breakpoints", () => {
		dispose = render(() => <Image alt="bg" fill loader={testLoader} src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toContain("3840w");
		for (const part of srcset.split(", ")) {
			expect(part).toMatch(/\d+w$/);
		}
	});

	it("loader src uses largest default width (3840)", () => {
		dispose = render(() => <Image alt="bg" fill loader={testLoader} src="/bg.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("https://cdn.test/w3840/q75/bg.jpg");
	});
});

/* ── Priority ── */

describe("priority", () => {
	it("sets eager/high/sync", () => {
		dispose = render(() => <Image alt="hero" maxHeight={600} maxWidth={1200} priority src="/hero.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("loading")).toBe("eager");
		expect(img?.getAttribute("fetchpriority")).toBe("high");
		expect(img?.getAttribute("decoding")).toBe("sync");
	});

	it("defaults to lazy/async/no fetchpriority", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("loading")).toBe("lazy");
		expect(img?.getAttribute("decoding")).toBe("async");
		expect(img?.getAttribute("fetchpriority")).toBeNull();
	});
});

/* ── Loader config ── */

describe("loader config", () => {
	it("global loader used when no per-instance", () => {
		configureImage({ loader: testLoader });
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toContain("cdn.test");
		expect(img?.getAttribute("srcset")).toBeTruthy();
	});

	it("per-instance overrides global", () => {
		const globalLoader: ImageLoader = ({ src }) => `https://global${src}`;
		const instanceLoader: ImageLoader = ({ src }) => `https://instance${src}`;
		configureImage({ loader: globalLoader });
		dispose = render(
			() => <Image alt="photo" loader={instanceLoader} maxHeight={600} maxWidth={900} src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("https://instance/photo.jpg");
	});

	it("no loader = passthrough src, no srcset", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/photo.jpg");
		expect(img?.getAttribute("srcset")).toBeNull();
	});
});

/* ── Quality ── */

describe("quality", () => {
	it("defaults to 75", () => {
		configureImage({ loader: testLoader });
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toContain("/q75/");
	});

	it("custom quality passed to loader", () => {
		configureImage({ loader: testLoader });
		dispose = render(
			() => <Image alt="photo" maxHeight={600} maxWidth={900} quality={90} src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toContain("/q90/");
	});
});

/* ── Blur placeholder ── */

describe("blur placeholder", () => {
	const blurDataURL = "data:image/png;base64,abc123";

	it("blur + blurDataURL sets background-image", () => {
		dispose = render(
			() => (
				<Image
					alt="photo"
					blurDataURL={blurDataURL}
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("background-image");
		expect(style).toContain(blurDataURL);
	});

	it("onLoad clears blur but keeps layout styles", () => {
		dispose = render(
			() => (
				<Image
					alt="photo"
					blurDataURL={blurDataURL}
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("style") ?? "").toContain(blurDataURL);

		img?.dispatchEvent(new Event("load"));

		const styleAfter = img?.getAttribute("style") ?? "";
		expect(styleAfter).not.toContain(blurDataURL);
		expect(styleAfter).toContain("max-width: 900px");
	});

	it("blur without blurDataURL warns, no background", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		dispose = render(
			() => <Image alt="photo" maxHeight={600} maxWidth={900} placeholder="blur" src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).not.toContain("background-image");
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("user style merged with blur (object form)", () => {
		dispose = render(
			() => (
				<Image
					alt="photo"
					blurDataURL={blurDataURL}
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
					style={{ "border-radius": "8px" }}
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain(blurDataURL);
		expect(style).toContain("border-radius");
		expect(style).toContain("max-width: 900px");
	});

	it("user style merged with blur (string form)", () => {
		dispose = render(
			() => (
				<Image
					alt="photo"
					blurDataURL={blurDataURL}
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
					style={{ "border-radius": "8px" }}
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain(blurDataURL);
		expect(style).toContain("border-radius");
	});
});

/* ── onLoad forwarding ── */

describe("onLoad forwarding", () => {
	it("user onLoad called with blur active", () => {
		const onLoad = vi.fn();
		dispose = render(
			() => (
				<Image
					alt="photo"
					blurDataURL="data:image/png;base64,abc"
					maxHeight={600}
					maxWidth={900}
					onLoad={onLoad}
					placeholder="blur"
					src="/photo.jpg"
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		img?.dispatchEvent(new Event("load"));
		expect(onLoad).toHaveBeenCalledTimes(1);
	});

	it("user onLoad called without placeholder", () => {
		const onLoad = vi.fn();
		dispose = render(
			() => <Image alt="photo" maxHeight={600} maxWidth={900} onLoad={onLoad} src="/photo.jpg" />,
			container,
		);
		const img = container.querySelector("img");
		img?.dispatchEvent(new Event("load"));
		expect(onLoad).toHaveBeenCalledTimes(1);
	});
});

/* ── Rest props ── */

describe("rest props", () => {
	it("forwards class, id, data-* attrs", () => {
		dispose = render(
			() => (
				<Image
					alt="photo"
					class="hero-img"
					data-testid="hero"
					id="main-photo"
					maxHeight={600}
					maxWidth={900}
					src="/photo.jpg"
				/>
			),
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("class")).toBe("hero-img");
		expect(img?.getAttribute("id")).toBe("main-photo");
		expect(img?.getAttribute("data-testid")).toBe("hero");
	});
});

/* ── Static image data ── */

const staticHero: StaticImageData = {
	blurDataURL: "data:image/webp;base64,UklGRh4A",
	height: 1080,
	src: "/assets/hero-1920-abc123.webp",
	variants: {
		1080: "/assets/hero-1080-z.webp",
		1200: "/assets/hero-1200-w.webp",
		1920: "/assets/hero-1920-abc123.webp",
		640: "/assets/hero-640-x.webp",
		828: "/assets/hero-828-y.webp",
	},
	width: 1920,
};

describe("static image data", () => {
	it("auto-derives dimensions from static data", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBe("1920");
		expect(img?.getAttribute("height")).toBe("1080");
	});

	it("auto-enables blur placeholder from static data", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("background-image");
		expect(style).toContain(staticHero.blurDataURL);
	});

	it("sets src to data.src (largest variant)", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/assets/hero-1920-abc123.webp");
	});

	it("builds srcset from variants", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toContain("640w");
		expect(srcset).toContain("828w");
		expect(srcset).toContain("1920w");
	});

	it("maxWidth override constrains display and filters srcset", () => {
		dispose = render(() => <Image alt="hero" maxWidth={600} src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("max-width: 600px");
		const srcset = img?.getAttribute("srcset") ?? "";
		/* cap = 600 * 2 = 1200 → should include ≤ 1200, exclude 1920 */
		expect(srcset).toContain("640w");
		expect(srcset).toContain("1200w");
		expect(srcset).not.toContain("1920w");
	});

	it("fixed mode with static data uses density srcset", () => {
		const staticIcon: StaticImageData = {
			blurDataURL: "data:image/webp;base64,abc",
			height: 48,
			src: "/assets/icon-48.webp",
			variants: { 48: "/assets/icon-48.webp", 96: "/assets/icon-96.webp" },
			width: 48,
		};
		dispose = render(() => <Image alt="icon" fixed height={48} src={staticIcon} width={48} />, container);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toContain("1x");
		expect(srcset).toContain("2x");
	});

	it("fill mode with static data includes all variants", () => {
		dispose = render(() => <Image alt="bg" fill src={staticHero} />, container);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toContain("640w");
		expect(srcset).toContain("1920w");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("position: absolute");
	});

	it("placeholder='none' suppresses blur even with static data", () => {
		dispose = render(() => <Image alt="hero" placeholder="none" src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).not.toContain("background-image");
	});

	it("string src still works (no regression)", () => {
		dispose = render(() => <Image alt="photo" maxHeight={600} maxWidth={900} src="/photo.jpg" />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/photo.jpg");
		expect(img?.getAttribute("width")).toBe("900");
	});
});

/* ── Static image edge cases ── */

describe("static image edge cases", () => {
	const staticHero: StaticImageData = {
		blurDataURL: "data:image/webp;base64,UklGRh4A",
		height: 1080,
		src: "/assets/hero-1920-abc123.webp",
		variants: {
			1080: "/assets/hero-1080-z.webp",
			1200: "/assets/hero-1200-w.webp",
			1920: "/assets/hero-1920-abc123.webp",
			640: "/assets/hero-640-x.webp",
			828: "/assets/hero-828-y.webp",
		},
		width: 1920,
	};

	it("priority sets eager/high/sync with static data", () => {
		dispose = render(() => <Image alt="hero" priority src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("loading")).toBe("eager");
		expect(img?.getAttribute("fetchpriority")).toBe("high");
		expect(img?.getAttribute("decoding")).toBe("sync");
	});

	it("custom sizes overrides auto-generated sizes", () => {
		dispose = render(() => <Image alt="hero" sizes="(max-width: 768px) 100vw, 50vw" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("(max-width: 768px) 100vw, 50vw");
	});

	it("auto-generates sizes from data.width when no override", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("(min-width: 1920px) 1920px, 100vw");
	});

	it("explicit blurDataURL overrides static data blur", () => {
		const customBlur = "data:image/png;base64,CUSTOM_BLUR";
		dispose = render(() => <Image alt="hero" blurDataURL={customBlur} src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain(customBlur);
		expect(style).not.toContain(staticHero.blurDataURL);
	});

	it("loader prop is ignored when static data present", () => {
		const spyLoader: ImageLoader = vi.fn(() => "/cdn/nope.webp");
		dispose = render(() => <Image alt="hero" loader={spyLoader} src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/assets/hero-1920-abc123.webp");
		expect(spyLoader).not.toHaveBeenCalled();
	});

	it("global loader is ignored when static data present", () => {
		const spyLoader: ImageLoader = vi.fn(() => "/cdn/nope.webp");
		configureImage({ loader: spyLoader });
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/assets/hero-1920-abc123.webp");
		expect(spyLoader).not.toHaveBeenCalled();
	});

	it("onLoad clears blur and keeps layout with static data", async () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("style")).toContain("background-image");

		img?.dispatchEvent(new Event("load"));
		await new Promise((r) => setTimeout(r, 0));

		const styleAfter = img?.getAttribute("style") ?? "";
		expect(styleAfter).not.toContain("background-image");
		expect(styleAfter).toContain("max-width: 1920px");
		expect(styleAfter).toContain("aspect-ratio");
	});

	it("user onLoad callback fires with static blur active", () => {
		const onLoad = vi.fn();
		dispose = render(() => <Image alt="hero" onLoad={onLoad} src={staticHero} />, container);
		const img = container.querySelector("img");
		img?.dispatchEvent(new Event("load"));
		expect(onLoad).toHaveBeenCalledTimes(1);
	});

	it("user style (object) merged with static blur + layout", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} style={{ "border-radius": "8px" }} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("border-radius");
		expect(style).toContain("background-image");
		expect(style).toContain("max-width: 1920px");
	});

	it("user style (string) merged with static blur + layout", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} style={{ "border-radius": "8px" }} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("border-radius");
		expect(style).toContain("background-image");
	});

	it("rest props forwarded with static data", () => {
		dispose = render(
			() => <Image alt="hero" class="my-hero" data-testid="hero-img" id="main" src={staticHero} />,
			container,
		);
		const img = container.querySelector("img");
		expect(img?.getAttribute("class")).toBe("my-hero");
		expect(img?.getAttribute("id")).toBe("main");
		expect(img?.getAttribute("data-testid")).toBe("hero-img");
	});

	it("maxWidth larger than data.width still uses data.width for layout", () => {
		dispose = render(() => <Image alt="hero" maxWidth={3000} src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		/* maxWidth override honored — layout uses 3000, but srcset only has variants up to 1920 */
		expect(style).toContain("max-width: 3000px");
		const srcset = img?.getAttribute("srcset") ?? "";
		/* All variants included since cap = 3000*2 = 6000 */
		expect(srcset).toContain("1920w");
	});

	it("single-variant static data produces single srcset entry", () => {
		const tiny: StaticImageData = {
			blurDataURL: "data:image/webp;base64,abc",
			height: 100,
			src: "/assets/tiny-100.webp",
			variants: { 100: "/assets/tiny-100.webp" },
			width: 100,
		};
		dispose = render(() => <Image alt="tiny" src={tiny} />, container);
		const img = container.querySelector("img");
		const srcset = img?.getAttribute("srcset") ?? "";
		expect(srcset).toBe("/assets/tiny-100.webp 100w");
	});

	it("static fill mode sets sizes=100vw, no width/height attrs", () => {
		dispose = render(() => <Image alt="bg" fill src={staticHero} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("sizes")).toBe("100vw");
		expect(img?.getAttribute("width")).toBeNull();
		expect(img?.getAttribute("height")).toBeNull();
	});

	it("static fill mode still has blur from static data", () => {
		dispose = render(() => <Image alt="bg" fill src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("background-image");
		expect(style).toContain(staticHero.blurDataURL);
	});

	it("static fixed mode uses provided width/height, not data's", () => {
		dispose = render(() => <Image alt="icon" fixed height={48} src={staticHero} width={48} />, container);
		const img = container.querySelector("img");
		expect(img?.getAttribute("width")).toBe("48");
		expect(img?.getAttribute("height")).toBe("48");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("width: 48px");
		expect(style).toContain("height: 48px");
	});

	it("static responsive auto aspect-ratio from data dimensions", () => {
		dispose = render(() => <Image alt="hero" src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("aspect-ratio: 1920 / 1080");
	});

	it("explicit maxHeight overrides data height for aspect-ratio", () => {
		dispose = render(() => <Image alt="hero" maxHeight={500} src={staticHero} />, container);
		const img = container.querySelector("img");
		const style = img?.getAttribute("style") ?? "";
		expect(style).toContain("aspect-ratio: 1920 / 500");
		expect(img?.getAttribute("height")).toBe("500");
	});
});
