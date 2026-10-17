import { expect, it } from "vitest"
import { bodyStream, chunkText, type Chunk } from "./body-stream.ts"
import { invalidWrites } from "./writes.fixture.ts"

const decoder = new TextDecoder()

// A render that writes only what the test pushes.
function render(): { reader: ReadableStreamDefaultReader<Chunk>; push: (chunk: Chunk) => void; end: () => void } {
	const controllers: ReadableStreamDefaultController<Chunk>[] = []
	const stream = new ReadableStream<Chunk>({ start: (controller) => void controllers.push(controller) })
	return {
		reader: stream.getReader(),
		push: (chunk) => controllers[0]?.enqueue(chunk),
		end: () => controllers[0]?.close(),
	}
}

it("shell then chunks", async () => {
	const source = render()
	const reader = bodyStream("<html>", source.reader).getReader()
	source.push("<p>a</p>")
	source.push(new TextEncoder().encode("<p>b</p>"))
	source.end()
	const parts: string[] = []
	for (let next = await reader.read(); !next.done; next = await reader.read()) parts.push(decoder.decode(next.value))
	expect(parts).toEqual(["<html>", "<p>a</p>", "<p>b</p>"])
	expect([chunkText("x"), chunkText(undefined)]).toEqual(["x", ""])
})

// A consumer cancel that lands while the body's pull waits on the render ends the stream with no write into it, when
// the render then writes (BUGS.md 304).
it("cancel during a pull", async () => {
	const source = render()
	const writes = await invalidWrites(async () => {
		const reader = bodyStream("<html>", source.reader).getReader()
		await reader.read()
		const next = reader.read()
		await new Promise((resolve) => setTimeout(resolve, 0))
		await reader.cancel()
		expect(await next).toEqual({ done: true, value: undefined })
	})
	expect(writes).toEqual([])
})
