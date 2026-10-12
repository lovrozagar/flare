import { answerOf, envelopeOf, send, settle, type CallDeps, type CallTarget } from "./call.ts";

const NDJSON = "application/x-ndjson";

// `.stream()` answers NDJSON, one envelope per yielded value (02-system). Each line yields its data, and a failure
// line rejects the iterator after the values before it. A step that failed before the generator answers one JSON
// envelope instead, which rejects as a call does.
export async function* streamServerFn(fn: CallTarget, input: unknown, deps: CallDeps): AsyncGenerator<unknown> {
	const response = await send(fn, input, deps);
	if ((response.headers.get("content-type") ?? "").startsWith(NDJSON)) {
		for await (const line of lines(response.body)) {
			const wire = envelopeOf(JSON.parse(line)) ?? { status: 500, message: "A stream line is not an envelope" };
			yield settle(wire, deps);
		}
	} else yield await answerOf(response, deps);
}

// Whole lines only: a chunk may end inside one. The last line may have no newline.
async function* lines(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string> {
	if (body === null) return;
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		for (let end = buffer.indexOf("\n"); end !== -1; end = buffer.indexOf("\n")) {
			yield buffer.slice(0, end);
			buffer = buffer.slice(end + 1);
		}
	}
	buffer += decoder.decode();
	if (buffer !== "") yield buffer;
}
