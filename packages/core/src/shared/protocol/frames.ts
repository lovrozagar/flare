import type { HeadConfig } from "../route-builder/types.ts"
import { fromWire, toWire } from "./value.ts"

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
	// The request's dehydrated query cache, after the loaders ran: the client hydrates it at commit (B134).
	| { t: "q"; d: unknown }
	| { t: "d" }

export const MAX_LINE: number = 1024 * 1024

const KINDS = new Set(["l", "e", "h", "r", "c", "x", "q", "d"])

const OVERSIZE: Frame = { t: "e", m: "", e: { message: "Frame over 1 MiB" } }

// A response's frames and a line's JSON nesting, past which a hostile or broken stream would exhaust the tab (v0's
// 10,000 messages; plan 21 16.5). A wire value nests up to three JSON levels per level of the value (B145), so 1,024
// is a value about 340 levels deep.
const MAX_FRAMES = 10_000
const MAX_DEPTH = 1024
const TOO_MANY: Frame = { t: "e", m: "", e: { message: `Over ${MAX_FRAMES} frames` } }
const TOO_DEEP: Frame = { t: "e", m: "", e: { message: `Frame nested over ${MAX_DEPTH} levels` } }

const encoder = new TextEncoder()

// A frame's app values, an `l` frame's data, preloader context, and validated params and search, and a `c` frame's
// value, travel as wire values; the frame around them is JSON (B145).
export function encodeFrame(frame: Frame): string {
	return `${JSON.stringify(mapValues(frame, toWire))}\n`
}

// The error a value throws as a `c` frame's value, where the wire cannot hold it (a function, a class instance), or
// undefined when it encodes: the one check a data answer's `e` frame and a document's deferred view share (B145,
// BUGS.md 149, 505).
export function unencodable(value: unknown): { error: unknown } | undefined {
	try {
		encodeFrame({ t: "c", m: "", k: "", d: value })
		return undefined
	} catch (error) {
		return { error }
	}
}

export function decodeLine(line: string): Frame {
	return mapValues(parsedLine(line), fromWire)
}

// A line as JSON, its values still on the wire, so the nesting cap reads it before any value is decoded.
function parsedLine(line: string): Frame {
	const value: unknown = JSON.parse(line)
	if (!isFrame(value)) throw new Error(`Not a flare frame: ${line.slice(0, 80)}`)
	return value
}

function mapValues(frame: Frame, map: (value: unknown) => unknown): Frame {
	if (frame.t === "c") return { ...frame, d: map(frame.d) }
	if (frame.t !== "l") return frame
	const mapped: Frame = { ...frame, d: map(frame.d) }
	if ("p" in frame) mapped.p = map(frame.p)
	if ("v" in frame) mapped.v = map(frame.v)
	return mapped
}

// Text arrives in chunks that may split a line. A line, or an unfinished line, past 1 MiB, a frame past the
// response's 10,000, or one nested past 1,024 JSON levels becomes one `e` frame and the decoder stops: nothing after it is
// read.
export function frameDecoder(): { push: (text: string) => Frame[] } {
	const state = { buffer: "", stopped: false, count: 0 }
	const stop = (frames: Frame[], why: Frame = OVERSIZE): Frame[] => {
		state.stopped = true
		return [...frames, why]
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
				const raw = parsedLine(line)
				if (nestedOver(raw, MAX_DEPTH)) return stop(frames, TOO_DEEP)
				if (state.count === MAX_FRAMES) return stop(frames, TOO_MANY)
				state.count += 1
				frames.push(mapValues(raw, fromWire))
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

// Whether a value nests past `max` levels, walked without recursion, so the check itself cannot overflow the stack.
function nestedOver(value: unknown, max: number): boolean {
	const pending: Array<{ item: unknown; depth: number }> = [{ item: value, depth: 0 }]
	for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
		if (typeof next.item !== "object" || next.item === null) continue
		if (next.depth > max) return true
		for (const child of Object.values(next.item)) pending.push({ item: child, depth: next.depth + 1 })
	}
	return false
}
