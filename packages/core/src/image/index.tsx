import { createMemo, createSignal, type JSX, splitProps } from "solid-js"
import { warn } from "../logger.ts"

/* ── Static image data ── */

export interface StaticImageData {
	blurDataURL: string
	height: number
	src: string
	variants: Record<number, string>
	width: number
}

export function isStaticImage(
	src: StaticImageData | string | null | undefined,
): src is StaticImageData {
	return src !== null && src !== undefined && typeof src === "object" && "variants" in src
}

/* ── Loader types ── */

export interface ImageLoaderParams {
	quality: number
	src: string
	width: number
}

export type ImageLoader = (params: ImageLoaderParams) => string

export interface ImageConfig {
	loader?: ImageLoader
}

/* ── Props ── */

type FlareImgProps = Omit<
	JSX.ImgHTMLAttributes<HTMLImageElement>,
	"alt" | "decoding" | "fetchpriority" | "height" | "loading" | "src" | "srcset" | "width"
>

interface ImagePropsBase extends FlareImgProps {
	alt: string
	blurDataURL?: string
	loader?: ImageLoader
	placeholder?: "blur" | "none"
	priority?: boolean
	quality?: number
	sizes?: string
	src: StaticImageData | string
	widths?: number[]
}

export interface ResponsiveImageProps extends ImagePropsBase {
	aspectRatio?: number
	fill?: never
	fixed?: never
	height?: never
	maxHeight?: number
	maxWidth: number
	width?: never
}

export interface FixedImageProps extends ImagePropsBase {
	aspectRatio?: never
	fill?: never
	fixed: true
	height: number
	maxHeight?: never
	maxWidth?: never
	width: number
}

export interface FillImageProps extends ImagePropsBase {
	aspectRatio?: number
	fill: true
	fixed?: never
	height?: never
	maxHeight?: never
	maxWidth?: never
	width?: never
}

/** Static import — dimensions/blur auto-derived, maxWidth optional */
export interface StaticResponsiveImageProps extends FlareImgProps {
	alt: string
	blurDataURL?: string
	fill?: never
	fixed?: never
	height?: never
	loader?: ImageLoader
	maxHeight?: number
	maxWidth?: number
	placeholder?: "blur" | "none"
	priority?: boolean
	quality?: number
	sizes?: string
	src: StaticImageData
	width?: never
	widths?: number[]
}

export type ImageProps =
	| FillImageProps
	| FixedImageProps
	| ResponsiveImageProps
	| StaticResponsiveImageProps

/* Flattened internal type for splitProps — avoids TS intersection issues with Omit */
interface ImagePropsInternal {
	alt: string
	aspectRatio?: number
	blurDataURL?: string
	fill?: boolean
	fixed?: boolean
	height?: number
	loader?: ImageLoader
	maxHeight?: number
	maxWidth?: number
	onLoad?: JSX.EventHandlerUnion<HTMLImageElement, Event>
	placeholder?: "blur" | "none"
	priority?: boolean
	quality?: number
	sizes?: string
	src: StaticImageData | string
	style?: JSX.CSSProperties | string
	width?: number
	widths?: number[]
}

/* ── Global config ── */

let globalConfig: ImageConfig = {}

export function configureImage(config: ImageConfig): void {
	globalConfig = config
}

/** @internal */
export function resetImageConfig(): void {
	globalConfig = {}
}

/* ── Constants ── */

const DEFAULT_QUALITY = 75
const DEFAULT_WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048, 3840]

/* ── generateSrcSet ── */

export function generateSrcSet(params: {
	baseWidth: number
	loader: ImageLoader
	maxWidth?: number
	mode: "density" | "width"
	quality: number
	src: string
	widths: number[] | undefined
}): string | undefined {
	if (params.mode === "width") {
		const breakpoints = params.widths ?? DEFAULT_WIDTHS
		const cap = params.maxWidth !== undefined ? params.maxWidth * 2 : Number.POSITIVE_INFINITY
		const entries: number[] = breakpoints.filter((w) => w > 0 && w <= cap)
		if (params.baseWidth > 0 && !entries.includes(params.baseWidth)) entries.push(params.baseWidth)
		if (entries.length === 0) return undefined
		entries.sort((a, b) => a - b)
		return entries
			.map((w) => `${params.loader({ quality: params.quality, src: params.src, width: w })} ${w}w`)
			.join(", ")
	}
	const url1x = params.loader({ quality: params.quality, src: params.src, width: params.baseWidth })
	const url2x = params.loader({
		quality: params.quality,
		src: params.src,
		width: params.baseWidth * 2,
	})
	return `${url1x} 1x, ${url2x} 2x`
}

/* ── Static srcset helper ── */

export function buildStaticSrcSet(
	variants: Record<number, string>,
	mode: "density" | "width",
	baseWidth: number,
	maxWidth?: number,
): string | undefined {
	const widths = Object.keys(variants).map(Number)
	if (widths.length === 0) return undefined

	if (mode === "density") {
		const url1x = variants[baseWidth]
		const w2x = baseWidth * 2
		const url2x = variants[w2x] ?? closestVariant(variants, w2x)
		if (!url1x) return undefined
		return url2x ? `${url1x} 1x, ${url2x} 2x` : `${url1x} 1x`
	}

	const cap = maxWidth !== undefined ? maxWidth * 2 : Number.POSITIVE_INFINITY
	const filtered = widths.filter((w) => w > 0 && w <= cap)
	if (filtered.length === 0) return undefined
	filtered.sort((a, b) => a - b)
	return filtered.map((w) => `${variants[w]} ${w}w`).join(", ")
}

function closestVariant(variants: Record<number, string>, target: number): string | undefined {
	const widths = Object.keys(variants)
		.map(Number)
		.sort((a, b) => a - b)
	let best: number | undefined
	for (const w of widths) {
		if (w >= target) {
			best = w
			break
		}
	}
	if (!best) best = widths[widths.length - 1]
	return best !== undefined ? variants[best] : undefined
}

/* ── Pure helpers (not exported) ── */

/** Converts a decimal ratio to `W / H` fraction format (jsdom drops bare decimals) */
function aspectRatioToFraction(ratio: number): string {
	const h = 10000
	const w = Math.round(ratio * h)
	return `${w} / ${h}`
}

type ImageMode = "fill" | "fixed" | "responsive"

function computeImageMode(props: ImagePropsInternal): ImageMode {
	if (props.fill) return "fill"
	if (props.fixed) return "fixed"
	return "responsive"
}

function computeLayoutStyles(mode: ImageMode, props: ImagePropsInternal): JSX.CSSProperties {
	if (mode === "fixed") {
		return {
			height: `${props.height}px`,
			width: `${props.width}px`,
		}
	}
	if (mode === "fill") {
		const styles: JSX.CSSProperties = {
			height: "100%",
			inset: "0",
			"object-fit": "cover",
			position: "absolute",
			width: "100%",
		}
		if (props.aspectRatio) {
			styles["aspect-ratio"] = aspectRatioToFraction(props.aspectRatio)
		}
		return styles
	}
	/* responsive */
	const mw = props.maxWidth ?? 0
	const styles: JSX.CSSProperties = {
		"max-width": `${mw}px`,
		width: "100%",
	}
	if (props.maxHeight) {
		styles["aspect-ratio"] = `${mw} / ${props.maxHeight}`
	} else if (props.aspectRatio) {
		styles["aspect-ratio"] = aspectRatioToFraction(props.aspectRatio)
	}
	return styles
}

function computeSizes(mode: ImageMode, props: ImagePropsInternal): string {
	if (props.sizes) return props.sizes
	if (mode === "fixed") return `${props.width}px`
	if (mode === "fill") return "100vw"
	return `(min-width: ${props.maxWidth}px) ${props.maxWidth}px, 100vw`
}

function computeBaseWidth(mode: ImageMode, props: ImagePropsInternal): number {
	if (mode === "fixed") return props.width ?? 0
	if (mode === "responsive") return props.maxWidth ?? 0
	return DEFAULT_WIDTHS[DEFAULT_WIDTHS.length - 1]
}

function computeHtmlDimensions(
	mode: ImageMode,
	props: ImagePropsInternal,
): { height: number | undefined; width: number | undefined } {
	if (mode === "fixed") {
		return { height: props.height, width: props.width }
	}
	if (mode === "fill") {
		return { height: undefined, width: undefined }
	}
	/* responsive */
	const mw = props.maxWidth ?? 0
	let height: number | undefined
	if (props.maxHeight) {
		height = props.maxHeight
	} else if (props.aspectRatio) {
		height = Math.round(mw / props.aspectRatio)
	}
	return { height, width: props.maxWidth }
}

function cssPropertiesToString(css: JSX.CSSProperties): string {
	return Object.entries(css)
		.map(([key, value]) => `${key}: ${value}`)
		.join("; ")
}

function mergeStyles(
	layout: JSX.CSSProperties,
	blur: JSX.CSSProperties | undefined,
	user: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string {
	if (!blur && !user) return layout
	if (!blur && typeof user === "string") {
		return `${cssPropertiesToString(layout)};${user}`
	}
	if (!blur && typeof user === "object") {
		return { ...layout, ...user }
	}
	if (blur && !user) {
		return { ...layout, ...blur }
	}
	if (typeof user === "string") {
		return `${cssPropertiesToString({ ...layout, ...blur })};${user}`
	}
	return { ...layout, ...blur, ...user }
}

/* ── Image component ── */

export function Image(props: ImageProps): JSX.Element {
	const [local, rest] = splitProps(props as unknown as ImagePropsInternal, [
		"alt",
		"aspectRatio",
		"blurDataURL",
		"fill",
		"fixed",
		"height",
		"loader",
		"maxHeight",
		"maxWidth",
		"onLoad",
		"placeholder",
		"priority",
		"quality",
		"sizes",
		"src",
		"style",
		"width",
		"widths",
	])

	const [loaded, setLoaded] = createSignal(false)

	const resolvedStatic = createMemo(() => {
		if (!isStaticImage(local.src)) return undefined
		return local.src
	})

	const effectiveLoader = createMemo(() => local.loader ?? globalConfig.loader)
	const quality = createMemo(() => local.quality ?? DEFAULT_QUALITY)

	const mode = createMemo(() => computeImageMode(local))

	/* For static images, synthesize an internal props view with auto-derived values */
	const effectiveLocal = createMemo((): ImagePropsInternal => {
		const data = resolvedStatic()
		if (!data) return local
		return {
			...local,
			blurDataURL: local.blurDataURL ?? data.blurDataURL,
			maxHeight: local.maxHeight ?? data.height,
			maxWidth: local.maxWidth ?? data.width,
			placeholder: local.placeholder ?? "blur",
			src: data.src,
		}
	})

	const dimensions = createMemo(() => computeHtmlDimensions(mode(), effectiveLocal()))

	const layoutStyles = createMemo(() => {
		const m = mode()
		const eff = effectiveLocal()
		if (m === "responsive" && !eff.maxHeight && !eff.aspectRatio) {
			warn(
				"image",
				"responsive Image without maxHeight or aspectRatio — no layout shift prevention",
			)
		}
		return computeLayoutStyles(m, eff)
	})

	const resolvedSizes = createMemo(() => computeSizes(mode(), effectiveLocal()))

	const baseWidth = createMemo(() => computeBaseWidth(mode(), effectiveLocal()))

	const resolvedSrc = createMemo(() => {
		const data = resolvedStatic()
		if (data) return data.src
		const loader = effectiveLoader()
		const strSrc = local.src as string
		if (!loader) return strSrc
		return loader({ quality: quality(), src: strSrc, width: baseWidth() })
	})

	const srcset = createMemo(() => {
		const data = resolvedStatic()
		if (data) {
			const m = mode()
			const srcSetMode: "density" | "width" = m === "fixed" ? "density" : "width"
			const bw = baseWidth()
			const maxW = m === "responsive" ? (effectiveLocal().maxWidth ?? data.width) : undefined
			return buildStaticSrcSet(data.variants, srcSetMode, bw, maxW)
		}
		const loader = effectiveLoader()
		if (!loader) return undefined
		const m = mode()
		const bw = baseWidth()
		const srcSetMode: "density" | "width" = m === "fixed" ? "density" : "width"
		const maxW = m === "responsive" ? local.maxWidth : undefined
		return generateSrcSet({
			baseWidth: bw,
			loader,
			maxWidth: maxW,
			mode: srcSetMode,
			quality: quality(),
			src: local.src as string,
			widths: local.widths,
		})
	})

	const showBlur = createMemo(() => {
		const eff = effectiveLocal()
		if (eff.placeholder !== "blur") return false
		if (!eff.blurDataURL) {
			warn("image", 'placeholder="blur" requires blurDataURL prop')
			return false
		}
		return !loaded()
	})

	const blurStyles = createMemo((): JSX.CSSProperties | undefined => {
		if (!showBlur()) return undefined
		return {
			"background-image": `url("${(effectiveLocal().blurDataURL ?? "").replace(/["\\()]/g, (c) => `\\${c}`)}")`,
			"background-position": "center",
			"background-repeat": "no-repeat",
			"background-size": "cover",
		}
	})

	const finalStyle = createMemo((): JSX.CSSProperties | string =>
		mergeStyles(layoutStyles(), blurStyles(), local.style),
	)

	function handleLoad(event: Event): void {
		setLoaded(true)
		if (typeof local.onLoad === "function") {
			;(local.onLoad as (e: Event) => void)(event)
		}
	}

	return (
		<img
			{...rest}
			alt={local.alt}
			decoding={local.priority ? "sync" : "async"}
			fetchpriority={local.priority ? "high" : undefined}
			height={dimensions().height}
			loading={local.priority ? "eager" : "lazy"}
			onLoad={handleLoad}
			sizes={resolvedSizes()}
			src={resolvedSrc()}
			srcset={srcset()}
			style={finalStyle()}
			width={dimensions().width}
		/>
	) as JSX.Element
}
