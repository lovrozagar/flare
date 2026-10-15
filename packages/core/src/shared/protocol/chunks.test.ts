import { expect, it } from "vitest";
import { chunksOf } from "./chunks.ts";

function body(chunks: readonly string[], cancelled: string[] = []): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			const next = chunks[index];
			index += 1;
			if (next === undefined) controller.close();
			else controller.enqueue(encoder.encode(next));
		},
		cancel(reason) {
			cancelled.push(String(reason));
		},
	});
}

// Every chunk in order, with no async iteration of the stream (BUGS.md 123), and the lock released at the end.
it("reads every chunk", async () => {
	const stream = body(["a", "b", "c"]);
	const iterable = Reflect.get(ReadableStream.prototype, Symbol.asyncIterator);
	Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator);
	const seen: string[] = [];
	try {
		for await (const chunk of chunksOf(stream)) seen.push(new TextDecoder().decode(chunk));
	} finally {
		Reflect.set(ReadableStream.prototype, Symbol.asyncIterator, iterable);
	}
	expect(seen).toEqual(["a", "b", "c"]);
	expect(stream.locked).toBe(false);
});

// Leaving early cancels the body, as the built-in iterator does, and releases the lock.
it("early exit cancels", async () => {
	const cancelled: string[] = [];
	const stream = body(["a", "b", "c"], cancelled);
	for await (const chunk of chunksOf(stream)) {
		expect(new TextDecoder().decode(chunk)).toBe("a");
		break;
	}
	expect(cancelled).toHaveLength(1);
	expect(stream.locked).toBe(false);
});

// A body whose cancel rejects still ends the read quietly, its lock released.
it("cancel failure ignored", async () => {
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array([1]));
		},
		cancel() {
			throw new Error("cancel broke");
		},
	});
	for await (const _ of chunksOf(stream)) break;
	expect(stream.locked).toBe(false);
});
