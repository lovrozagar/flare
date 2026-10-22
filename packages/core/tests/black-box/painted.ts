// The chaos run's visible blank-screen check (plan 21 17.1): what share of the viewport's pixels differ from the page's
// background color. A page that shows nothing, white or any one color, is near 0 whatever text the DOM holds; the
// share, not the variance, stays steady across engines and fonts.

export type Rgb = [number, number, number]

// The share of pixels whose color differs from `base` by more than `tolerance` in any channel, so antialiasing and
// subpixel tints near the background do not count.
export function paintedFraction(data: Uint8Array, layout: { channels: number; base: Rgb; tolerance?: number }): number {
	const { channels, base, tolerance = 16 } = layout
	const total = Math.floor(data.length / channels)
	if (total === 0) return 0
	let painted = 0
	for (let at = 0; at < total * channels; at += channels) {
		const off =
			Math.abs((data[at] ?? 0) - base[0]) > tolerance ||
			Math.abs((data[at + 1] ?? 0) - base[1]) > tolerance ||
			Math.abs((data[at + 2] ?? 0) - base[2]) > tolerance
		if (off) painted += 1
	}
	return painted / total
}

// The page's background from the computed style: rgb or rgba, a transparent one the browser canvas's white.
export function background(computed: string): Rgb {
	const parts = /rgba?\(([^)]+)\)/
		.exec(computed)?.[1]
		?.split(",")
		.map((part) => Number(part.trim()))
	if (parts === undefined || parts.length < 3 || parts[3] === 0) return [255, 255, 255]
	return [parts[0] ?? 255, parts[1] ?? 255, parts[2] ?? 255]
}
