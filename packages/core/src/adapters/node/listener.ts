import { settleRequestBody } from "./body.ts";
import { toRequest } from "./request.ts";

type Ctx = { waitUntil: (promise: Promise<unknown>) => void };

type Server = {
	fetch: (request: Request, env: undefined, ctx: Ctx) => Promise<Response> | Response;
};

// What the listener reads of a Node `IncomingMessage`. `on` and `resume` are methods, called on the request itself.
type NodeReq = {
	method?: string | undefined;
	url?: string | undefined;
	headers: Readonly<Record<string, string | readonly string[] | undefined>>;
	resume?(): unknown;
	on?(event: "data" | "end", listener: (chunk: Uint8Array) => void): unknown;
	readableEnded?: boolean | undefined;
};

type NodeRes = {
	writeHead: (status: number) => void;
	setHeader: (name: string, value: string | readonly string[]) => void;
	write: (chunk: Uint8Array) => boolean;
	end: () => void;
	once: (event: "drain" | "close", callback: () => void) => void;
	writableFinished?: boolean;
	destroy?: () => void;
};

export function createNodeListener(server: Server, options?: unknown): (req: NodeReq, res: NodeRes) => void {
	if (options !== undefined) throw new Error("createNodeListener takes no options");
	const retained = new Set<Promise<unknown>>();
	return (req, res) => {
		const job = { server, req, res, retained, sent: false };
		// A failure before the headers is a bare 500. After them the socket is destroyed: the status is gone.
		void pump(job).catch(() => {
			if (job.sent) return res.destroy?.();
			res.writeHead(500);
			res.end();
		});
	};
}

type Job = { server: Server; req: NodeReq; res: NodeRes; retained: Set<Promise<unknown>>; sent: boolean };

async function pump(job: Job): Promise<void> {
	// The origin comes from Host, as the adapter resolves it, so CSRF compares a browser's Origin with it (B44).
	const headers = joinedHeaders(job.req.headers);
	const adapted = toRequest({ url: job.req.url ?? "/", headers });
	if (adapted.status === 400) {
		job.res.writeHead(400);
		job.res.end();
		return;
	}
	const body = requestBody(job.req);
	// Node emits close after a normal finish too. Only a close before the finish is a client disconnect, and
	// only that aborts the request signal, so background work after a full response keeps it (as on Workers).
	const disconnect = new AbortController();
	job.res.once("close", () => {
		if (job.res.writableFinished !== true) disconnect.abort();
	});
	const init: RequestInit = { method: job.req.method ?? "GET", headers, signal: disconnect.signal };
	if (body !== undefined) {
		init.body = body.stream;
		Object.assign(init, { duplex: "half" });
	}
	const request = new Request(adapted.url, init);
	const response = await job.server.fetch(request, undefined, {
		waitUntil(promise) {
			job.retained.add(promise);
		},
	});
	writeHeaders(job.res, response.headers);
	job.res.writeHead(response.status);
	job.sent = true;
	await writeBody(job.res, response.body, disconnect.signal);
	if (body !== undefined && job.req.readableEnded !== true) await body.release();
}

// Node keeps a repeated header as a list. The request carries it joined with ", ", as fetch Headers would.
function joinedHeaders(headers: NodeReq["headers"]): Record<string, string> {
	return Object.fromEntries(
		Object.entries(headers).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, typeof value === "string" ? value : value.join(", ")]],
		),
	);
}

// `on` and `resume` stay calls on the request: a real `IncomingMessage` needs its receiver.
function requestBody(req: NodeReq): { stream: ReadableStream<Uint8Array>; release: () => Promise<void> } | undefined {
	if (req.method === "GET" || req.method === "HEAD") return undefined;
	if (req.on === undefined || req.resume === undefined) return undefined;
	const on = (event: "data" | "end", listener: (chunk: Uint8Array) => void): unknown => req.on?.(event, listener);
	const resume = (): unknown => req.resume?.();
	return {
		stream: new ReadableStream<Uint8Array>({
			start(controller) {
				on("data", (chunk) => controller.enqueue(chunk));
				on("end", () => controller.close());
			},
			pull() {
				resume();
			},
		}),
		release: () => settleRequestBody({ on, resume }),
	};
}

function writeHeaders(res: NodeRes, headers: Headers): void {
	headers.forEach((value, name) => {
		if (name === "set-cookie") return;
		res.setHeader(name, value);
	});
	const cookies = headers.getSetCookie();
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
}

// A client that disconnects cancels the body, so the producer stops instead of writing into a closed socket.
async function writeBody(res: NodeRes, body: ReadableStream<Uint8Array> | null, gone: AbortSignal): Promise<void> {
	if (body === null) {
		res.end();
		return;
	}
	const reader = body.getReader();
	gone.addEventListener("abort", () => void reader.cancel(), { once: true });
	for (;;) {
		const step = await reader.read();
		if (step.done) {
			res.end();
			return;
		}
		if (!res.write(step.value)) await drain(res);
	}
}

function drain(res: NodeRes): Promise<void> {
	return new Promise((resolve) => {
		res.once("drain", () => resolve());
	});
}
