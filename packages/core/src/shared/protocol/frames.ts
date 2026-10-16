import type { HeadConfig } from "../route-builder/types.ts"

// `stack` in dev, `digest` in production, and never both (B76).
export type FrameError = { message: string; stack?: string | undefined; digest?: string | undefined }

// The seven NDJSON frames of 02-system. There is no `q` frame (B6, B16).
export type Frame =
	| { t: "l"; m: string; d: unknown; p?: unknown; v?: unknown }
	| { t: "e"; m: string; e: FrameError; k?: string }
	// `r`: this route's head replaces the merged head (`.head(fn, { replace: true })`, dx/head.md).
	| { t: "h"; m: string; d: HeadConfig; r?: true }
	| { t: "r" }
	| { t: "c"; m: string; k: string; d: unknown }
	| { t: "x"; s: number; u: string; r: boolean }
	| { t: "d" }

export const MAX_LINE: number = 1024 * 1024

const KINDS = new Set(["l", "e", "h", "r", "c", "x", "d"])

const OVERSIZE: Frame = { t: "e", m: "", e: { message: "Frame over 1 MiB" } }

const encoder = new TextEncoder()

export function encodeFrame(frame: Frame): string {
	return `${JSON.stringify(frame)}\n`
}

export function decodeLine(line: string): Frame {
	const value: unknown = JSON.parse(line)
	if (!isFrame(value)) throw new Error(`Not a flare frame: ${line.slice(0, 80)}`)
	return value
}

// Text arrives in chunks that may split a line. A line, or an unfinished line, past 1 MiB becomes one `e`
// frame and the decoder stops: nothing after it is read.
export function frameDecoder(): { push: (text: string) => Frame[] } {
	const state = { buffer: "", stopped: false }
	const stop = (frames: Frame[]): Frame[] => {
		state.stopped = true
		return [...frames, OVERSIZE]
	}
	return {
		push(text) {
			if (state.stopped) return []
			const joined = state.buffer + text
			const frames: Frame[] = []
			let start = 0
			for (let end = joined.indexOf("\n"); end !== -1; end = joined.indexOf("\n", start)) {
				const line = joined.slice(start, end)
				start = end + 1
				if (tooLong(line)) return stop(frames)
				frames.push(decodeLine(line))
			}
			state.buffer = joined.slice(start)
			return tooLong(state.buffer) ? stop(frames) : frames
		},
	}
}

function tooLong(line: string): boolean {
	return encoder.encode(line).length > MAX_LINE
}

function isFrame(value: unknown): value is Frame {
	return typeof value === "object" && value !== null && "t" in value && KINDS.has(String(value.t))
}
