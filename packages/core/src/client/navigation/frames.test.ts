import { expect, it, vi } from "vitest";
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import type { Deferred } from "../../shared/route-builder/register.ts";
import { endOf, framesOf, landFrames, revive, type Pending } from "./frames.ts";

// A source the test feeds frame by frame.
function feed(): { source: AsyncIterable<Frame>; push: (frame: Frame) => void; end: () => void } {
	const queue: Frame[] = [];
	const waiting: ((frame: IteratorResult<Frame>) => void)[] = [];
	let ended = false;
	const deliver = (): void => {
		while (waiting.length > 0 && (queue.length > 0 || ended)) {
			const next = queue.shift();
			waiting.shift()?.(next === undefined ? { done: true, value: undefined } : { done: false, value: next });
		}
	};
	return {
		source: {
			[Symbol.asyncIterator]: () => ({
				next: () =>
					new Promise<IteratorResult<Frame>>((resolve) => {
						waiting.push(resolve);
						deliver();
					}),
			}),
		},
		push(frame) {
			queue.push(frame);
			deliver();
		},
		end() {
			ended = true;
			deliver();
		},
	};
}

const quiet = { dev: false };

it("landed at r", async () => {
	const stream = feed();
	const landed = landFrames(stream.source, quiet);
	stream.push({ t: "l", m: "_root_", d: "root" });
	stream.push({ t: "l", m: "_root_/a", d: null });
	stream.push({ t: "h", m: "_root_/a", d: { title: "A" } });
	stream.push({ t: "r" });
	await expect(landed).resolves.toEqual({
		data: { _root_: "root", "_root_/a": null },
		heads: { "_root_/a": { title: "A" } },
	});
	stream.push({ t: "d" });
	stream.end();
});

it("deferred resolve", async () => {
	const stream = feed();
	const landed = landFrames(stream.source, quiet);
	stream.push({
		t: "l",
		m: "_root_/a",
		d: { slow: { __deferred: true, key: "d0" }, list: [{ __deferred: true, key: "d1" }] },
	});
	stream.push({ t: "r" });
	const data = (await landed).data["_root_/a"] as { slow: Deferred<string>; list: Deferred<number>[] };
	expect(JSON.parse(JSON.stringify(data.slow))).toEqual({ __deferred: true, key: "d0" });
	stream.push({ t: "c", m: "_root_/a", k: "d1", d: 7 });
	stream.push({ t: "c", m: "_root_/a", k: "d0", d: "SLOW" });
	stream.push({ t: "c", m: "_root_/other", k: "d0", d: "ignored" });
	stream.push({ t: "d" });
	stream.end();
	await expect(data.slow.promise).resolves.toBe("SLOW");
	await expect(data.list[0].promise).resolves.toBe(7);
});

it("deferred reject", async () => {
	const stream = feed();
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const landed = landFrames(stream.source, { dev: true, send });
	stream.push({ t: "l", m: "_root_/a", d: { a: { __deferred: true, key: "d0" }, b: { __deferred: true, key: "d1" } } });
	stream.push({ t: "r" });
	const data = (await landed).data["_root_/a"] as { a: Deferred<string>; b: Deferred<string> };
	stream.push({ t: "e", m: "_root_/a", k: "d0", e: { message: "slow failed", stack: "Error: slow failed\n    at x" } });
	stream.end();
	await expect(data.a.promise).rejects.toMatchObject({ message: "slow failed", stack: "Error: slow failed\n    at x" });
	await expect(data.b.promise).rejects.toThrow(/ended/);
	expect(send).not.toHaveBeenCalled();
});

// A body that lands one deferred value at `r`, then breaks with `reason`.
async function* broken(reason: Error): AsyncGenerator<Frame> {
	yield { t: "l", m: "_root_/a", d: { a: { __deferred: true, key: "d0" } } };
	yield { t: "r" };
	throw reason;
}

// A body that breaks after `r`: a network failure rejects the pending value with its reason, while a request a newer
// navigation aborted leaves it pending for the page that is leaving. Neither escapes as a rejection (BUGS.md B58).
it("broken body", async () => {
	const failed = await landFrames(broken(new TypeError("network error")), quiet);
	await expect((failed.data["_root_/a"] as { a: Deferred<string> }).a.promise).rejects.toThrow("network error");
	const stop = new AbortController();
	stop.abort();
	const aborted = await landFrames(broken(new DOMException("aborted", "AbortError")), {
		...quiet,
		signal: stop.signal,
	});
	const value = (aborted.data["_root_/a"] as { a: Deferred<string> }).a.promise;
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(await Promise.race([value, Promise.resolve("pending")])).toBe("pending");
});

it("dev overlay", async () => {
	const stream = feed();
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const landed = landFrames(stream.source, { dev: true, send });
	stream.push({ t: "l", m: "_root_", d: "root" });
	stream.push({ t: "e", m: "_root_/a", e: { message: "boom", stack: "Error: boom\n    at y" } });
	stream.push({ t: "r" });
	const failure = (await landed).failure;
	expect(failure).toMatchObject({ route: "_root_/a", status: 500 });
	expect(failure?.error.stack).toBe("Error: boom\n    at y");
	expect(send).toHaveBeenCalledExactlyOnceWith({
		type: "error",
		err: { message: "boom", stack: "Error: boom\n    at y" },
	});
	stream.end();
});

it("prod no overlay", async () => {
	const stream = feed();
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const landed = landFrames(stream.source, { dev: false, send });
	stream.push({ t: "e", m: "_root_/a", e: { message: "Something went wrong", digest: "0123456789ab" } });
	stream.push({ t: "r" });
	expect((await landed).failure?.error.stack).toBe("");
	expect(send).not.toHaveBeenCalled();
	stream.end();
});

it("redirect", async () => {
	const stream = feed();
	const landed = landFrames(stream.source, quiet);
	stream.push({ t: "x", s: 302, u: "/login", r: true });
	await expect(landed).resolves.toEqual({
		data: {},
		heads: {},
		redirect: { status: 302, url: "/login", replace: true },
	});
});

it("ended early", async () => {
	const stream = feed();
	const landed = landFrames(stream.source, quiet);
	stream.push({ t: "l", m: "_root_", d: "root" });
	stream.end();
	await expect(landed).rejects.toThrow(/before r/);
});

it("frames of a body", async () => {
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const text = encodeFrame({ t: "l", m: "_root_", d: "root" }) + encodeFrame({ t: "r" });
			controller.enqueue(encoder.encode(text.slice(0, 10)));
			controller.enqueue(encoder.encode(text.slice(10)));
			controller.close();
		},
	});
	const seen: Frame[] = [];
	for await (const frame of framesOf(body)) seen.push(frame);
	expect(seen).toEqual([{ t: "l", m: "_root_", d: "root" }, { t: "r" }]);
});

it("preloader", async () => {
	const source = (async function* (): AsyncIterable<Frame> {
		yield { t: "l", m: "_root_", d: null };
		yield { t: "l", m: "_root_/a", d: "a", p: { role: "admin" } };
		yield { t: "r" };
	})();
	const landed = await landFrames(source, { dev: false });
	expect(landed.preloaders).toEqual({ "_root_/a": { role: "admin" } });
});

// A landing's end settles once the frames after `r` are read; a landing that came from no frames, a prefetch reused
// whole, has already ended (BUGS.md 89).
it("landing end", async () => {
	const { source, push, end } = feed();
	push({ t: "l", m: "_root_", d: { late: { __deferred: true, key: "late" } } });
	push({ t: "r" });
	const landed = await landFrames(source, { dev: false });
	let ended = false;
	void endOf(landed).then(() => (ended = true));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(ended).toBe(false);
	push({ t: "c", m: "_root_", k: "late", d: 1 });
	end();
	await endOf(landed);
	expect(ended).toBe(true);
	await expect(endOf({ data: {}, heads: {} })).resolves.toBeUndefined();
});

// A stored page's resolve value travels inline: its read resolves at once, and it is never a hole a fill waits for or a
// value the landing's end rejects. A real hole still reaches `holes` (BUGS.md 94).
it("inline value", async () => {
	const { source, push, end } = feed();
	const holes = vi.fn<(pending: Pending) => void>();
	push({
		t: "l",
		m: "_root_/a",
		d: {
			latest: { __deferred: true, key: "latest", value: "1.0.0" },
			stats: { __deferred: true, key: "stats", hole: true },
		},
	});
	push({ t: "r" });
	const landed = await landFrames(source, { dev: false, holes });
	const data = landed.data["_root_/a"] as { latest: Deferred<string>; stats: Deferred<number> };
	await expect(data.latest.promise).resolves.toBe("1.0.0");
	end();
	await endOf(landed);
	expect(holes).toHaveBeenCalledOnce();
	const { source: only, push: pushOnly, end: endOnly } = feed();
	pushOnly({ t: "l", m: "_root_/a", d: { latest: { __deferred: true, key: "latest", value: "1.0.0" } } });
	pushOnly({ t: "r" });
	const alone = await landFrames(only, { dev: false, holes });
	endOnly();
	await endOf(alone);
	expect(holes).toHaveBeenCalledOnce();
	await expect((alone.data["_root_/a"] as { latest: Deferred<string> }).latest.promise).resolves.toBe("1.0.0");
});

// A fill sends a value the stored page holds as `kept`: the landing reads the page's own one promise, and fills the
// holes beside it (BUGS.md 94).
it("kept value", async () => {
	const page: Pending = new Map();
	const shown = revive(
		{
			latest: { __deferred: true, key: "latest", value: "1.0.0" },
			stats: { __deferred: true, key: "stats", hole: true },
		},
		"_root_/a",
		page,
	) as { latest: Deferred<string>; stats: Deferred<number> };
	const { source, push, end } = feed();
	push({
		t: "l",
		m: "_root_/a",
		d: { latest: { __deferred: true, key: "latest", kept: true }, stats: { __deferred: true, key: "stats" } },
	});
	push({ t: "r" });
	const landed = await landFrames(source, { dev: false, reuse: page });
	const filled = landed.data["_root_/a"] as { latest: Deferred<string>; stats: Deferred<number> };
	expect(filled.latest.promise).toBe(shown.latest.promise);
	await expect(filled.latest.promise).resolves.toBe("1.0.0");
	push({ t: "c", m: "_root_/a", k: "stats", d: 37 });
	end();
	await endOf(landed);
	await expect(shown.stats.promise).resolves.toBe(37);
	await expect(filled.latest.promise).resolves.toBe("1.0.0");
});

// A `kept` value the page does not hold rejects with a reason that names it, never a hang: the guard against a fill
// whose skipped value has no source on the client, which once broke the root (BUGS.md 89, 94).
it("missing kept", async () => {
	const { source, push, end } = feed();
	push({ t: "l", m: "_root_/a", d: { latest: { __deferred: true, key: "latest", kept: true } } });
	push({ t: "r" });
	const landed = await landFrames(source, { dev: false, reuse: new Map() });
	const data = landed.data["_root_/a"] as { latest: Deferred<string> };
	end();
	await expect(data.latest.promise).rejects.toThrow('The fill kept "latest" of _root_/a, which the page does not hold');
});
