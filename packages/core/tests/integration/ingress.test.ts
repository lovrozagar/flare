import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createNodeListener } from "../../src/adapters/node/listener.ts";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter } from "../../src/shared/router/create-router.ts";

const home = createPage("_root_")
	.loader(() => "Home")
	.render((props) => String(props.loaderData));
const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render(() => "") },
	routeTree: [{ id: "_root_", path: "/", module: home }],
});
const app = createServer({ router });
let fetches = 0;
const listener = createNodeListener({
	fetch(request) {
		fetches += 1;
		return app.fetch(request);
	},
});
const server = http.createServer((req, res) => {
	listener(nodeReq(req), nodeRes(res));
});

let port = 0;

beforeAll(async () => {
	port = await listen(server);
});

afterAll(() => {
	server.close();
});

const HOSTILE = ["//evil/", "/\\evil", "http://evil/", "/a\u0001"];

it("preview is not required", async () => {
	const ok = await fetchPath({ port, method: "GET", path: "/" });
	expect(ok.status).toBe(200);
	expect(ok.body).toContain("Home");
	expectSecurity(ok.headers);
	const missing = await fetchPath({ port, method: "GET", path: "/nope" });
	expect(missing.status).toBe(404);
	expectSecurity(missing.headers);
});

it("hostile table", async () => {
	fetches = 0;
	for (const path of HOSTILE) {
		const response = await fetchPath({ port, method: "GET", path });
		expect(response.status).toBe(400);
	}
	expect(fetches).toBe(0);
});

function expectSecurity(headers: http.IncomingHttpHeaders): void {
	expect(headers["x-content-type-options"]).toBe("nosniff");
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
	expect(headers["x-frame-options"]).toBe("DENY");
	expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
	expect(headers["strict-transport-security"]).toBeUndefined();
	expect(headers["x-powered-by"]).toBeUndefined();
}

function listen(target: http.Server): Promise<number> {
	return new Promise((resolve) => {
		target.listen(0, "127.0.0.1", () => {
			const address = target.address();
			if (address === null || typeof address === "string") throw new Error("port");
			resolve(address.port);
		});
	});
}

function fetchPath(input: { port: number; method: string; path: string }): Promise<{
	status: number;
	body: string;
	headers: http.IncomingHttpHeaders;
}> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(input.port, "127.0.0.1", () => {
			socket.write(`${input.method} ${input.path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
		});
		const chunks: Buffer[] = [];
		socket.on("data", (chunk: Buffer) => chunks.push(chunk));
		socket.on("error", reject);
		socket.on("end", () => {
			const raw = Buffer.concat(chunks).toString();
			const headerEnd = raw.indexOf("\r\n\r\n");
			const head = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
			const lines = head.split("\r\n");
			const statusLine = lines[0] ?? "";
			const status = Number(statusLine.split(" ")[1]);
			const headers: http.IncomingHttpHeaders = {};
			for (const line of lines.slice(1)) {
				const split = line.indexOf(":");
				if (split === -1) continue;
				headers[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim();
			}
			resolve({ status, body: headerEnd === -1 ? "" : raw.slice(headerEnd + 4), headers });
		});
	});
}

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
