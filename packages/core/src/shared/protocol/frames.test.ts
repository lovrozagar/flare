import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { decodeLine, encodeFrame, frameDecoder, MAX_LINE, type Frame } from "./frames.ts"

const corpus = readFileSync(new URL("./frames.corpus.txt", import.meta.url), "utf8")
	.split("\n")
	.filter((line) => line !== "")

function framesOf(t: Frame["t"]): Frame[] {
	return corpus.map((line) => decodeLine(line)).filter((frame) => frame.t === t)
}

it("round trip", () => {
	expect(new Set(corpus.map((line) => decodeLine(line).t))).toEqual(new Set(["l", "c", "e", "h", "x", "r", "d"]))
	for (const line of corpus) {
		const frame = decodeLine(line)
		expect(encodeFrame(frame)).toBe(`${line}\n`)
		expect(decodeLine(encodeFrame(frame))).toEqual(frame)
	}
})

it("unknown t", () => {
	expect(() => decodeLine('{"t":"g"}')).toThrow(/frame/)
	expect(() => decodeLine("[]")).toThrow(/frame/)
})

// `q` carries the request's query cache (B134); a kind the protocol lacks still throws.
it("query frame", () => {
	expect(decodeLine('{"t":"q","d":{"queries":[]}}')).toEqual({ t: "q", d: { queries: [] } })
	expect(() => decodeLine('{"t":"z"}')).toThrow(/frame/)
})

it("oversize", () => {
	const decoder = frameDecoder()
	const head = decoder.push(`{"t":"r"}\n{"t":"l","m":"a","d":"`)
	expect(head).toEqual([{ t: "r" }])
	const over = decoder.push(`${"x".repeat(MAX_LINE)}"}\n{"t":"d"}\n`)
	expect(over).toEqual([{ t: "e", m: "", e: { message: "Frame over 1 MiB" } }])
	expect(decoder.push('{"t":"d"}\n')).toEqual([])
	const unfinished = frameDecoder()
	expect(unfinished.push(`{"t":"d"}\n{"t":"l","d":"${"x".repeat(MAX_LINE)}`)).toEqual([
		{ t: "d" },
		{ t: "e", m: "", e: { message: "Frame over 1 MiB" } },
	])
	expect(MAX_LINE).toBe(1024 * 1024)
})

it("redirect only", () => {
	const [redirect] = framesOf("x")
	const body = encodeFrame(redirect)
	expect(body.split("\n")).toEqual([body.trimEnd(), ""])
	expect(frameDecoder().push(body)).toEqual([redirect])
})

it("e dev", () => {
	const dev = framesOf("e").find((frame) => frame.t === "e" && frame.k === undefined)
	expect(dev).toMatchObject({ e: { message: "secret", stack: expect.stringContaining("at loader") } })
	expect(dev).not.toHaveProperty("e.digest")
})

it("e prod", () => {
	const prod = framesOf("e").find((frame) => frame.t === "e" && frame.k !== undefined)
	expect(prod).toMatchObject({ e: { message: "Something went wrong", digest: "0123456789ab" } })
	expect(prod).not.toHaveProperty("e.stack")
})

// A response past 10,000 frames, or a frame nested past 256 levels, would exhaust the tab: past either cap the decoder
// gives one `e` frame and stops, so the navigation fails cleanly (v0's cap, plan 21 16.5, BUGS.md 222).
it("caps", () => {
	const decoder = frameDecoder()
	const line = encodeFrame({ t: "r" })
	const frames = decoder.push(line.repeat(10_001))
	expect(frames).toHaveLength(10_001)
	expect(frames.at(-1)).toEqual({ t: "e", m: "", e: { message: "Over 10000 frames" } })
	expect(decoder.push(line)).toEqual([])
	const deep = frameDecoder()
	const nested = `{"t":"l","m":"a","d":${"[".repeat(300)}${"]".repeat(300)}}\n`
	expect(deep.push(nested)).toEqual([{ t: "e", m: "", e: { message: "Frame nested over 256 levels" } }])
	expect(deep.push(line)).toEqual([])
	const shallow = `{"t":"l","m":"a","d":${"[".repeat(200)}${"]".repeat(200)}}\n`
	expect(frameDecoder().push(shallow)).toHaveLength(1)
})
