import { createServer } from "node:http";
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

// A response whose close event the test fires, finished or not.
function closable(finished: boolean): {
	res: Parameters<ReturnType<typeof createNodeListener>>[1];
	close: () => void;
	ended: Promise<void>;
} {
	const closers: (() => void)[] = [];
	const ended = Promise.withResolvers<void>();
	const res = {
		writeHead: noop,
		setHeader: noop,
		write: () => true,
		end: () => ended.resolve(),
		once(event: "drain" | "close", callback: () => void) {
			if (event === "close") closers.push(callback);
		},
		get writableFinished() {
			return finished;
		},
	};
	return { res, close: () => closers.forEach((callback) => callback()), ended: ended.promise };
}

function capture(): { listener: ReturnType<typeof createNodeListener>; seen: Request[] } {
	const seen: Request[] = [];
	const listener = createNodeListener({
		fetch: (request) => {
			seen.push(request);
			return new Response("done");
		},
	});
	return { listener, seen };
}

it("finish keeps signal", async () => {
	const { listener, seen } = capture();
	const done = closable(true);
	listener(req(), done.res);
	await done.ended;
	done.close();
	expect(seen[0].signal.aborted).toBe(false);
});

it("disconnect aborts", async () => {
	const { listener, seen } = capture();
	const gone = closable(false);
	listener(req(), gone.res);
	await gone.ended;
	gone.close();
	expect(seen[0].signal.aborted).toBe(true);
});

it("fetch throws", async () => {
	const statuses: number[] = [];
	let ended = false;
	const listener = createNodeListener({
		fetch: () => Promise.reject(new Error("server broke")),
	});
	listener(req(), {
		writeHead(status) {
			statuses.push(status);
		},
		setHeader() {},
		write: () => true,
		end() {
			ended = true;
		},
		once() {},
	});
	await settle();
	expect(statuses).toEqual([500]);
	expect(ended).toBe(true);
});

// The request's origin is the one the adapter resolved from Host, so a browser's same-origin POST passes CSRF (B44).
it("host origin", async () => {
	const urls: string[] = [];
	const listener = createNodeListener({
		fetch: async (request) => {
			urls.push(request.url);
			return new Response("ok");
		},
	});
	const res = { writeHead() {}, setHeader() {}, write: () => true, end() {}, once() {} };
	listener({ ...req(), url: "/a?b=1", headers: { host: "127.0.0.1:5173" } }, res);
	listener(req(), res);
	await settle();
	expect(urls).toEqual(["http://127.0.0.1:5173/a?b=1", "http://localhost/"]);
});

// A real `node:http` server: the listener is its request handler as written, and a POST body is read through the
// `IncomingMessage` itself, whose `on` and `resume` need their receiver. A repeated header reaches the request.
it("node request", async () => {
	const http = createServer(
		createNodeListener({
			fetch: async (request) => new Response(`${request.headers.get("x-pair")} ${await request.text()}`),
		}),
	);
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
	const address = http.address();
	const port = typeof address === "object" && address !== null ? address.port : 0;
	try {
		const headers: Array<[string, string]> = [
			["x-pair", "a"],
			["x-pair", "b"],
		];
		const response = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", body: "ping", headers });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("a, b ping");
	} finally {
		await new Promise((resolve) => http.close(resolve));
	}
	// A bare request object: no method or url is `GET /`, a listed header is joined, and an absent one is dropped.
	const seen: Request[] = [];
	const bare = createNodeListener({
		fetch: async (request) => {
			seen.push(request);
			return new Response(null);
		},
	});
	bare(
		{ headers: { "x-list": ["a", "b"], "x-gone": undefined } },
		{
			writeHead() {},
			setHeader() {},
			write: () => true,
			end() {},
			once() {},
		},
	);
	await settle();
	expect(seen[0]?.method).toBe("GET");
	expect(seen[0]?.url).toBe("http://localhost/");
	expect(seen[0]?.headers.get("x-list")).toBe("a, b");
	expect(seen[0]?.headers.has("x-gone")).toBe(false);
});
