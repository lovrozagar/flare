import { expect, it } from "vitest";
import { createNodeListener } from "../../src/adapters/node/listener.ts";
import { title } from "../e2e/apps/minimal/src/routes/_root_/home.page.tsx";
import { server } from "../e2e/apps/minimal/src/server.ts";

const listener = createNodeListener(server);

function call(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
	const chunks: Uint8Array[] = [];
	let status = 0;
	let finish = (): void => undefined;
	const done = new Promise<void>((resolve) => {
		finish = resolve;
	});
	listener(
		{ method: "GET", url: path, headers },
		{
			writeHead(code) {
				status = code;
			},
			setHeader() {},
			write(chunk) {
				chunks.push(chunk);
				return true;
			},
			end() {
				finish();
			},
			once() {},
		},
	);
	return done.then(() => ({ status, body: Buffer.concat(chunks).toString("utf8") }));
}

it("GET /", async () => {
	const response = await call("/");
	expect(response.status).toBe(200);
	expect(response.body).toContain(title);
	expect(response.body).toContain("self.flare=");
});

it("GET /nope", async () => {
	const response = await call("/nope");
	expect(response.status).toBe(404);
});

it("two concurrent renders", async () => {
	const [alpha, beta] = await Promise.all([call("/", { "x-sentinel": "alpha" }), call("/", { "x-sentinel": "beta" })]);
	expect(alpha.body).toContain("alpha");
	expect(alpha.body).not.toContain("beta");
	expect(beta.body).toContain("beta");
	expect(beta.body).not.toContain("alpha");
});
