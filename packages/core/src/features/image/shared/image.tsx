import { createComponent, createSignal, onSettled } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { imageQuality, imageWidths } from "./config.ts";

// What an optimized image import binds to: the intrinsic size, and one variant per configured width that fits. `src`
// is the largest variant (dx/features.md Image).
export type ImageBinding = {
	src: string;
	width: number;
	height: number;
	variants: readonly { width: number; src: string }[];
};

type Base = {
	alt: string;
	src: ImageBinding | string;
	widths?: readonly number[];
	sizes?: string;
	quality?: number;
	priority?: boolean;
	placeholder?: "none" | "blur";
	blurDataURL?: string;
};

type Fill = {
	fill: true;
	fixed?: never;
	width?: never;
	height?: never;
	maxWidth?: never;
	maxHeight?: never;
	aspectRatio?: never;
};
type Fixed = {
	fixed: true;
	width: number;
	height: number;
	fill?: never;
	maxWidth?: never;
	maxHeight?: never;
	aspectRatio?: never;
};
type Responsive = { maxWidth?: number; maxHeight?: number; aspectRatio?: number; fill?: never; fixed?: false };

export type ImageProps = Base & (Fill | Fixed | Responsive);

type Mode = "fill" | "fixed" | "responsive" | "plain";

// A dev image URL with the component's quality, when it differs from the plugin's. Production bytes are encoded once,
// at the plugin quality, so a built URL is left alone (dx/features.md Image).
export function withQuality(url: string, quality: number | undefined, dev: boolean): string {
	if (!dev || quality === undefined || quality === imageQuality) return url;
	return `${url}&q=${quality}`;
}

// One `<img>`. Layout styles are inline (B88). A string `src` is used as it is, with no srcset.
export function Image(props: ImageProps): JSX.Element {
	const [loaded, setLoaded] = createSignal(false);
	return createComponent(Dynamic, {
		component: "img",
		get alt() {
			return props.alt;
		},
		get src() {
			return typeof props.src === "string" ? props.src : url(props.src.src, props);
		},
		get srcset() {
			return srcset(props);
		},
		get sizes() {
			return props.sizes;
		},
		get width() {
			return mode(props) === "fixed" ? Reflect.get(props, "width") : undefined;
		},
		get height() {
			return mode(props) === "fixed" ? Reflect.get(props, "height") : undefined;
		},
		get loading() {
			return props.priority === true ? "eager" : "lazy";
		},
		get decoding() {
			return props.priority === true ? "sync" : "async";
		},
		get fetchpriority() {
			return props.priority === true ? "high" : undefined;
		},
		get style() {
			return { ...layout(props), ...(loaded() ? {} : blur(props)) };
		},
		onLoad: () => setLoaded(true),
		// A priority image often finishes before hydrate attaches onLoad, so its event is never heard. After the
		// commit, an image that is already complete clears the blur too (BUGS.md B20).
		ref: (element: HTMLImageElement) => {
			onSettled(() => {
				if (element.complete) setLoaded(true);
			});
		},
	});
}

// The modes fill, fixed, and responsive are mutually exclusive.
function mode(props: ImageProps): Mode {
	const set = [props.fill === true, props.fixed === true, props.maxWidth !== undefined];
	if (set.filter(Boolean).length > 1) throw new Error("Image takes one of fill, fixed, and maxWidth");
	if (props.fill === true) {
		if (Reflect.get(props, "width") !== undefined || Reflect.get(props, "height") !== undefined)
			throw new Error("Image fill takes no width or height");
		return "fill";
	}
	if (props.fixed === true) {
		if (typeof props.width !== "number" || typeof props.height !== "number")
			throw new Error("Image fixed needs width and height");
		return "fixed";
	}
	return props.maxWidth === undefined ? "plain" : "responsive";
}

function configured(width: number): number {
	if (!imageWidths.includes(width)) throw new Error(`Image width ${width} is not one of the plugin widths`);
	return width;
}

function url(src: string, props: ImageProps): string {
	return withQuality(src, props.quality, import.meta.env?.DEV === true);
}

function srcset(props: ImageProps): string | undefined {
	const current = mode(props);
	if (typeof props.src === "string") return undefined;
	const binding = props.src;
	const variant = (width: number): string | undefined => binding.variants.find((item) => item.width === width)?.src;
	if (current === "fixed") return density(props, variant);
	const allowed = props.widths?.map(configured);
	const cap = current === "responsive" ? Number(props.maxWidth) * 2 : Number.POSITIVE_INFINITY;
	const listed = binding.variants.filter(
		(item) => item.width <= cap && (allowed === undefined || allowed.includes(item.width)),
	);
	return listed.map((item) => `${url(item.src, props)} ${item.width}w`).join(", ");
}

// A fixed image is density-described: the variant at `width` is 1x, and the one at twice that is 2x when the plugin
// lists that width. A missing 2x is left out, never labeled with another width.
function density(props: ImageProps, variant: (width: number) => string | undefined): string | undefined {
	const width = configured(Number(Reflect.get(props, "width")));
	const double = imageWidths.includes(width * 2) ? variant(width * 2) : undefined;
	const one = variant(width);
	const entries = [
		one === undefined ? [] : [`${url(one, props)} 1x`],
		double === undefined ? [] : [`${url(double, props)} 2x`],
	];
	const listed = entries.flat();
	return listed.length === 0 ? undefined : listed.join(", ");
}

function layout(props: ImageProps): JSX.CSSProperties {
	const current = mode(props);
	const intrinsic = typeof props.src === "string" ? undefined : `${props.src.width} / ${props.src.height}`;
	if (current === "fill") return { position: "absolute", inset: "0", "object-fit": "cover", "aspect-ratio": intrinsic };
	if (current === "fixed") {
		return { width: `${Reflect.get(props, "width")}px`, height: `${Reflect.get(props, "height")}px` };
	}
	if (current === "plain") return {};
	const maxWidth = Number(props.maxWidth);
	const ratio = props.aspectRatio ?? (props.maxHeight === undefined ? intrinsic : `${maxWidth} / ${props.maxHeight}`);
	return {
		width: "100%",
		"max-width": `${maxWidth}px`,
		...(props.maxHeight !== undefined && { "max-height": `${props.maxHeight}px` }),
		"aspect-ratio": ratio === undefined ? undefined : String(ratio),
	};
}

// The blur placeholder covers the box until the image loads. Only a `data:` URL is used.
function blur(props: ImageProps): JSX.CSSProperties {
	if (props.placeholder !== "blur") return {};
	const data = props.blurDataURL;
	if (data === undefined) throw new Error("Image placeholder blur needs a blurDataURL");
	if (!data.startsWith("data:")) return {};
	return { "background-image": `url(${JSON.stringify(data)})`, "background-size": "cover" };
}
