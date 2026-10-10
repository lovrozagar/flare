/** @vitest-environment node */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isServerFnValidationError } from "../../../src/errors/index.ts";
import { createServerFnPlugin } from "../../../src/plugins/server-fn.ts";

/*
 * A server fn as the browser gets it: the module goes through the client build
 * transform (handler and validator bodies stripped), then app code calls the
 * export directly. That call has to reach the server over HTTP.
 */

const RUNTIME = new URL("../../../src/server-fn/index.ts", import.meta.url).pathname;

const SOURCE = `import { createServerFn } from "@lovrozagar/flare/server-fn";
import { secret } from "./server-only-dep";

export const greet = createServerFn({ method: "post", name: "greet" })
	.input((value) => value as { name: string })
	.handler(async (ctx) => ({ hello: ctx.input.name, secret }));

export const ping = createServerFn({ method: "get", name: "ping" })
	.handler(async () => "pong");
`;

type ClientModule = {
	greet: (input: { name: string }) => Promise<{ hello: string }>;
	ping: () => Promise<string>;
};

let dir: string;
let mod: ClientModule;
let clientCode: string;

beforeAll(async () => {
	const plugin = createServerFnPlugin() as unknown as {
		transform: (this: { environment: { name: string } }, code: string, id: string) => { code: string } | null;
	};
	dir = mkdtempSync(join(tmpdir(), "flare-client-call-"));
	const file = join(dir, "greet.server-fn.ts");
	const out = plugin.transform.call({ environment: { name: "client" } }, SOURCE, file);
	if (!out) throw new Error("client transform left the module untouched");
	clientCode = out.code;
	writeFileSync(file, clientCode.replace("@lovrozagar/flare/server-fn", RUNTIME));
	mod = (await import(/* @vite-ignore */ file)) as ClientModule;
});

afterAll(() => {
	rmSync(dir, { force: true, recursive: true });
});

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function inBrowser(respond: (url: string, init?: RequestInit) => Response) {
	const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => respond(String(url), init));
	(globalThis as Record<string, unknown>).window = {};
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

afterEach(() => {
	if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window;
	else (globalThis as Record<string, unknown>).window = originalWindow;
	globalThis.fetch = originalFetch;
});

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

describe("server fn called from the client build", () => {
	it("keeps server-only code out of the client module", () => {
		expect(clientCode).not.toContain("server-only-dep");
		expect(clientCode).not.toContain("ctx.input.name");
	});

	it("POSTs the input to the server fn endpoint and resolves with its data", async () => {
		const fetchMock = inBrowser(() => json({ data: { hello: "ada" } }));

		await expect(mod.greet({ name: "ada" })).resolves.toEqual({ hello: "ada" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toMatch(/^\/_flare\/server-fn\/[^/]+\/greet$/);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ name: "ada" });
	});

	it("uses GET for a get server fn", async () => {
		const fetchMock = inBrowser(() => json({ data: "pong" }));

		await expect(mod.ping()).resolves.toBe("pong");

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toMatch(/^\/_flare\/server-fn\/[^/]+\/ping/);
		expect(init?.method ?? "GET").toBe("GET");
	});

	it("rejects with the server's validation errors", async () => {
		inBrowser(() => json({ errors: { fieldErrors: { name: ["Required"] }, formErrors: [] } }, 400));

		const err = await mod.greet({ name: "" }).catch((e: unknown) => e);
		expect(isServerFnValidationError(err)).toBe(true);
	});

	it("rejects with the server's message on other failures", async () => {
		inBrowser(() => json({ message: "boom" }, 500));

		await expect(mod.greet({ name: "ada" })).rejects.toThrow('Server function "greet" failed: boom');
	});
});
