import { expect, it } from "vitest"
import { background, paintedFraction } from "./painted.ts"

// Pixels as raw RGBA: `count` of one color.
function pixels(...runs: Array<[number, [number, number, number]]>): Uint8Array {
	const bytes: number[] = []
	for (const [count, [r, g, b]] of runs) for (let i = 0; i < count; i++) bytes.push(r, g, b, 255)
	return Uint8Array.from(bytes)
}

// The share of pixels that differ from the background by more than the tolerance: a one-color page is 0, and
// antialiasing within the tolerance does not count as content.
it("painted fraction", () => {
	const white: [number, number, number] = [255, 255, 255]
	expect(paintedFraction(pixels([100, white]), { channels: 4, base: white })).toBe(0)
	expect(paintedFraction(pixels([75, white], [25, [0, 0, 0]]), { channels: 4, base: white })).toBe(0.25)
	expect(paintedFraction(pixels([90, white], [10, [250, 252, 251]]), { channels: 4, base: white })).toBe(0)
	expect(paintedFraction(pixels([3, white], [1, [30, 30, 30]]), { channels: 4, base: white })).toBe(0.25)
})

// The page's background as the browser computes it: rgb or rgba, and a transparent one is the canvas's white.
it("background color", () => {
	expect(background("rgb(15, 23, 42)")).toEqual([15, 23, 42])
	expect(background("rgba(1, 2, 3, 1)")).toEqual([1, 2, 3])
	expect(background("rgba(0, 0, 0, 0)")).toEqual([255, 255, 255])
	expect(background("transparent")).toEqual([255, 255, 255])
})
