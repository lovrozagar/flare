import { settleRequestBody } from "./body.ts";
import { toRequest } from "./request.ts";

type Ctx = { waitUntil: (promise: Promise<unknown>) => void };

type Server = {
	fetch: (request: Request, env: undefined, ctx: Ctx) => Promise<Response> | Response;
};

type NodeReq = {
	method: string;
	url: string;
	headers: Record<string, string>;
	resume?: () => void;
	on?: (event: "data" | "end", listener: (chunk: Uint8Array) => void) => void;
	readableEnded?: boolean;
};

type NodeRes = {
	writeHead: (status: number) => void;
	setHeader: (name: string, value: string | readonly string[]) => void;
	write: (chunk: Uint8Array) => boolean;
	end: () => void;
	once: (event: "drain" | "close", callback: () => void) => void;
};

export function createNodeListener(server: Server, options?: unknown): (req: NodeReq, res: NodeRes) => void {
	if (options !== undefined) throw new Error("createNodeListener takes no options");
	const retained = new Set<Promise<unknown>>();
	return (req, res) => {
		void pump({ server, req, res, retained });
	};
}

type Job = { server: Server; req: NodeReq; res: NodeRes; retained: Set<Promise<unknown>> };

async function pump(job: Job): Promise<void> {
	if (toRequest({ url: job.req.url }).status === 400) {
		job.res.writeHead(400);
		job.res.end();
		return;
	}
	const body = requestBody(job.req);
	// A client that disconnects closes the response. The request signal tells the render to stop.
	const disconnect = new AbortController();
	job.res.once("close", () => disconnect.abort());
	const init: RequestInit = {
		method: job.req.method,
		headers: requestHeaders(job.req.headers),
		signal: disconnect.signal,
	};
	if (body !== undefined) {
		init.body = body.stream;
		Object.assign(init, { duplex: "half" });
	}
	const request = new Request(`http://localhost${job.req.url}`, init);
	const response = await job.server.fetch(request, undefined, {
		waitUntil(promise) {
			job.retained.add(promise);
		},
	});
	writeHeaders(job.res, response.headers);
	job.res.writeHead(response.status);
	await writeBody(job.res, response.body);
	if (body !== undefined && job.req.readableEnded !== true) await body.release();
}

function requestHeaders(headers: NodeReq["headers"]): Headers {
	return new Headers(headers);
}

function requestBody(req: NodeReq): { stream: ReadableStream<Uint8Array>; release: () => Promise<void> } | undefined {
	if (req.method === "GET" || req.method === "HEAD") return undefined;
	const on = req.on;
	const resume = req.resume;
	if (on === undefined || resume === undefined) return undefined;
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

async function writeBody(res: NodeRes, body: ReadableStream<Uint8Array> | null): Promise<void> {
	if (body === null) {
		res.end();
		return;
	}
	const reader = body.getReader();
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
