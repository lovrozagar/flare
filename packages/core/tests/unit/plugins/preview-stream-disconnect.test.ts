/** @vitest-environment node */
/*
 * A client that leaves mid-stream (closed tab, aborted navigation) must not take the server down.
 * Bun's node:http throws on a write after the response ended, so the server runs under Bun.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const SERVER = fileURLToPath(new URL("../../fixtures/stream-disconnect/server.ts", import.meta.url));
let child: ChildProcess | undefined;

afterEach(() => {
	child?.kill();
	child = undefined;
});

async function start(): Promise<{ output: () => string; port: number }> {
	const proc = spawn("bun", [SERVER], { stdio: ["ignore", "pipe", "pipe"] });
	child = proc;
	let output = "";
	proc.stdout?.on("data", (chunk) => (output += String(chunk)));
	proc.stderr?.on("data", (chunk) => (output += String(chunk)));
	const port = await vi.waitFor(
		() => {
			const m = /port (\d+)/.exec(output);
			if (!m) throw new Error(`server not listening yet: ${output}`);
			return Number(m[1]);
		},
		{ interval: 50, timeout: 15_000 },
	);
	return { output: () => output, port };
}

/* Reads the first body chunk of a slow response, then drops the connection. */
function leaveMidStream(port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = request({ headers: { "x-slow": "1" }, host: "127.0.0.1", path: "/", port }, (res) => {
			res.once("data", () => {
				req.destroy();
				resolve();
			});
		});
		req.on("error", (error) => {
			if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
		});
		req.end();
	});
}

describe("preview server: client disconnect mid-stream", () => {
	it("keeps serving and cancels the abandoned body", async () => {
		const { output, port } = await start();
		for (let i = 0; i < 3; i++) await leaveMidStream(port);
		await vi.waitFor(() => expect(output().match(/cancelled/g)?.length).toBe(3), { timeout: 5_000 });
		/* Past the point the abandoned streams would have written their next chunks. */
		await new Promise((resolve) => setTimeout(resolve, 200));
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(await response.text()).toBe("ok");
		expect(child?.exitCode).toBeNull();
		expect(output()).not.toMatch(/write after end|ERR_STREAM/i);
	}, 30_000);
});
