type Ctx = { waitUntil: (promise: Promise<unknown>) => void };

type Server = {
	fetch: (request: Request, env: undefined, ctx: Ctx) => Promise<Response> | Response;
};

type NodeReq = { method: string; url: string; headers: Record<string, string> };

type NodeRes = {
	writeHead: (status: number) => void;
	setHeader: (name: string, value: string | readonly string[]) => void;
	write: (chunk: Uint8Array) => boolean;
	end: () => void;
	once: (event: "drain", callback: () => void) => void;
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
	const request = new Request(`http://localhost${job.req.url}`, { method: job.req.method });
	const response = await job.server.fetch(request, undefined, {
		waitUntil(promise) {
			job.retained.add(promise);
		},
	});
	job.res.writeHead(response.status);
	writeHeaders(job.res, response.headers);
	await writeBody(job.res, response.body as ReadableStream<Uint8Array>);
}

function writeHeaders(res: NodeRes, headers: Headers): void {
	headers.forEach((value, name) => {
		if (name === "set-cookie") return;
		res.setHeader(name, value);
	});
	const cookies = headers.getSetCookie();
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
}

async function writeBody(res: NodeRes, body: ReadableStream<Uint8Array>): Promise<void> {
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
