import http from "node:http";
import { expect, it } from "vitest";
import { createNodeListener } from "./listener.ts";

function nodeReq(req: http.IncomingMessage) {
	return {
		method: req.method ?? "GET",
		url: req.url ?? "/",
		headers: headerRecord(req.headers),
		resume() {
			req.resume();
		},
		on(event: "data" | "end", listener: (chunk: Uint8Array) => void) {
			if (event === "end") req.on("end", () => listener(new Uint8Array()));
			else req.on("data", (chunk: Buffer) => listener(chunk));
		},
		get readableEnded() {
			return req.readableEnded;
		},
	};
}

function nodeRes(res: http.ServerResponse) {
	return {
		writeHead(status: number) {
			res.writeHead(status);
		},
		setHeader(name: string, value: string | readonly string[]) {
			res.setHeader(name, value);
		},
		write(chunk: Uint8Array) {
			return res.write(chunk);
		},
		end() {
			res.end();
		},
		once(event: "drain" | "close", callback: () => void) {
			res.once(event, callback);
		},
	};
}

function headerRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (typeof value === "string") out[name] = value;
	}
	return out;
}

function listen(server: http.Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") throw new Error("port");
			resolve(address.port);
		});
	});
}

function send(input: {
	port: number;
	agent: http.Agent;
	method: string;
	path: string;
	body?: string;
}): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: "127.0.0.1",
				port: input.port,
				path: input.path,
				method: input.method,
				agent: input.agent,
				headers: input.body === undefined ? {} : { "content-length": Buffer.byteLength(input.body) },
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
			},
		);
		req.on("error", reject);
		if (input.body !== undefined) req.write(input.body);
		req.end();
	});
}

it("unread post", async () => {
	const listener = createNodeListener({
		fetch: () => new Response(null, { status: 405 }),
	});
	const server = http.createServer((req, res) => {
		if (req.url === "/next") {
			res.writeHead(204);
			res.end();
			return;
		}
		listener(nodeReq(req), nodeRes(res));
	});
	const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
	const port = await listen(server);
	try {
		const first = await send({ port, agent, method: "POST", path: "/page", body: "payload" });
		expect(first.status).toBe(405);
		const next = await Promise.race([
			send({ port, agent, method: "GET", path: "/next" }).then((result) => result),
			new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1000)),
		]).catch(() => "closed" as const);
		if (next === "timeout") throw new Error("unread body blocked the next request");
		expect(next === "closed" || next.status === 204).toBe(true);
	} finally {
		agent.destroy();
		server.close();
	}
});

it("response route keeps the stream", async () => {
	const listener = createNodeListener({
		fetch: async (request) => new Response(await request.text()),
	});
	const server = http.createServer((req, res) => {
		listener(nodeReq(req), nodeRes(res));
	});
	const agent = new http.Agent({ keepAlive: false });
	const port = await listen(server);
	try {
		const response = await send({ port, agent, method: "POST", path: "/response", body: "payload" });
		expect(response.status).toBe(200);
		expect(response.body).toBe("payload");
	} finally {
		agent.destroy();
		server.close();
	}
});
