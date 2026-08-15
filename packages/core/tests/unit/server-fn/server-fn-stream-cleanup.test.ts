import { describe, expect, it, vi } from "vitest";
import { handleServerFnRequest, type ServerFnRegistration } from "../../../src/server-fn/index.ts";

vi.mock("../../../src/server-context", () => ({
	addRevalidatedTags: () => {},
	getRevalidatedTags: () => [],
	getRevalidationContext: () => ({}),
	getServerContext: () => ({}),
}));

function createStreamRegistration(
	generator: (ctx: { signal: AbortSignal }) => AsyncGenerator<unknown>,
): Map<string, ServerFnRegistration> {
	const reg: ServerFnRegistration = {
		authenticate: false,
		fn: generator,
		id: "test-stream",
		method: "post",
		name: "testStream",
		stream: true,
	};
	return new Map([["test-stream", reg]]);
}

describe("streaming server fn generator cleanup on error", () => {
	it("should cleanup generator when serialization fails", async () => {
		let cleanedUp = false;

		async function* circularGenerator(): AsyncGenerator<unknown> {
			try {
				/* yield a value that JSON.stringify cannot serialize */
				const circular: Record<string, unknown> = {};
				circular.self = circular;
				yield circular;
				/* if cleanup doesn't happen, generator stays suspended here */
				yield "unreachable";
			} finally {
				cleanedUp = true;
			}
		}

		const fns = createStreamRegistration(() => circularGenerator());
		const request = new Request("http://localhost/_fn/test-stream/testStream", {
			method: "POST",
		});

		const response = await handleServerFnRequest(request, {}, fns);
		expect(response.status).toBe(200);

		/* consume the stream to trigger the serialization error path */
		const reader = response.body?.getReader();
		if (reader) {
			let done = false;
			while (!done) {
				const result = await reader.read();
				done = result.done;
			}
		}

		expect(cleanedUp).toBe(true);
	});

	it("should abort the signal when generator throws", async () => {
		let capturedSignal: AbortSignal | undefined;

		async function* signalGenerator(ctx: { signal: AbortSignal }): AsyncGenerator<string> {
			capturedSignal = ctx.signal;
			yield "chunk1";
			throw new Error("generator failed");
		}

		const fns = createStreamRegistration((ctx: { signal: AbortSignal }) => signalGenerator(ctx));
		const request = new Request("http://localhost/_fn/test-stream/testStream", {
			method: "POST",
		});

		const response = await handleServerFnRequest(request, {}, fns);

		/* consume the stream */
		const reader = response.body?.getReader();
		if (reader) {
			let done = false;
			while (!done) {
				const result = await reader.read();
				done = result.done;
			}
		}

		expect(capturedSignal?.aborted).toBe(true);
	});

	it("should still send error message to client on generator throw", async () => {
		async function* failingGenerator(): AsyncGenerator<string> {
			yield "chunk1";
			throw new Error("something broke");
		}

		const fns = createStreamRegistration(() => failingGenerator());
		const request = new Request("http://localhost/_fn/test-stream/testStream", {
			method: "POST",
		});

		const response = await handleServerFnRequest(request, {}, fns);
		const text = await response.text();
		const lines = text.trim().split("\n");

		const hasChunk = lines.some((l) => {
			const parsed = JSON.parse(l) as Record<string, unknown>;
			return "c" in parsed;
		});
		const hasError = lines.some((l) => {
			const parsed = JSON.parse(l) as Record<string, unknown>;
			return "e" in parsed;
		});

		expect(hasChunk).toBe(true);
		expect(hasError).toBe(true);
	});
});
