import { expect, it } from "vitest";
import { createNodeListener } from "./listener.ts";

type Ctx = { waitUntil: (promise: Promise<unknown>) => void };

function req(): { method: string; url: string; headers: Record<string, string> } {
	return { method: "GET", url: "/", headers: {} };
}

function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

function noop(): void {}

it("flush", async () => {
	const encoder = new TextEncoder();
	let pushSecond: () => void = noop;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("one"));
			pushSecond = () => {
				controller.enqueue(encoder.encode("two"));
				controller.close();
			};
		},
	});
	const writes: string[] = [];
	let ended = false;
	const listener = createNodeListener({
		fetch: async () => new Response(body, { headers: { "x-test": "1" } }),
	});
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write(chunk) {
			writes.push(new TextDecoder().decode(chunk));
			return true;
		},
		end() {
			ended = true;
		},
		once() {},
	});
	await settle();
	expect(writes).toEqual(["one"]);
	pushSecond();
	await settle();
	expect(ended).toBe(true);
	expect(writes).toEqual(["one", "two"]);
});

it("backpressure", async () => {
	const encoder = new TextEncoder();
	let pushSecond: () => void = noop;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("one"));
			pushSecond = () => {
				controller.enqueue(encoder.encode("two"));
				controller.close();
			};
		},
	});
	const writes: string[] = [];
	let drain: () => void = noop;
	const listener = createNodeListener({ fetch: async () => new Response(body) });
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write(chunk) {
			writes.push(new TextDecoder().decode(chunk));
			return false;
		},
		end() {},
		once(_event, callback) {
			drain = callback;
		},
	});
	await settle();
	expect(writes).toEqual(["one"]);
	pushSecond();
	await settle();
	expect(writes).toEqual(["one"]);
	drain();
	await settle();
	expect(writes).toEqual(["one", "two"]);
});

it("post without a socket", async () => {
	for (const method of ["HEAD", "POST"]) {
		let ended = false;
		const listener = createNodeListener({
			fetch: async () => new Response(null, { status: method === "POST" ? 405 : 200 }),
		});
		listener(
			{ method, url: "/page", headers: { "x-test": "1" } },
			{
				writeHead() {},
				setHeader() {},
				write() {
					return true;
				},
				end() {
					ended = true;
				},
				once() {},
			},
		);
		await settle();
		expect(ended).toBe(true);
	}
});

it("no options", () => {
	const server = { fetch: async () => new Response("ok") };
	expect(() => createNodeListener(server, {})).toThrow(/options/);
});

it("wait until", async () => {
	const background = new Promise<void>(() => undefined);
	const args: unknown[] = [];
	let ended = false;
	const listener = createNodeListener({
		fetch(request, env, ctx) {
			args.push(request, env, ctx);
			ctx.waitUntil(background);
			return new Response("ok");
		},
	});
	listener(req(), {
		writeHead() {},
		setHeader() {},
		write() {
			return true;
		},
		end() {
			ended = true;
		},
		once() {},
	});
	await settle();
	expect(args[0]).toBeInstanceOf(Request);
	expect(args[1]).toBeUndefined();
	expect(typeof (args[2] as Ctx).waitUntil).toBe("function");
	expect(ended).toBe(true);
});

it("set-cookie", async () => {
	const headers = new Headers();
	headers.append("set-cookie", "a=1");
	headers.append("set-cookie", "b=2");
	const cookies: Array<string | readonly string[]> = [];
	const listener = createNodeListener({
		fetch: async () => new Response("ok", { headers }),
	});
	listener(req(), {
		writeHead() {},
		setHeader(name, value) {
			if (name.toLowerCase() === "set-cookie") cookies.push(value);
		},
		write() {
			return true;
		},
		end() {},
		once() {},
	});
	await settle();
	expect(cookies.flat()).toEqual(["a=1", "b=2"]);
});
