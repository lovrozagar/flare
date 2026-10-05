import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/navigation/recover.ts", () => ({ recoverWithDocumentLoad: vi.fn(() => true) }));

import { setBuildId } from "../../../src/build-id.ts";
import { BuildMismatchError } from "../../../src/errors/index.ts";
import { recoverWithDocumentLoad } from "../../../src/navigation/recover.ts";
import { callServerFnOverHttp } from "../../../src/server-fn/rpc.ts";

const mockRecover = recoverWithDocumentLoad as ReturnType<typeof vi.fn>;

function json(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });
}

beforeEach(() => {
	mockRecover.mockClear();
});

afterEach(() => {
	setBuildId(undefined);
	vi.unstubAllGlobals();
});

describe("server fn client — build skew", () => {
	it("sends the page's build id", async () => {
		setBuildId("abc");
		const spy = vi.fn().mockResolvedValue(json({ data: 1 }));
		vi.stubGlobal("fetch", spy);

		await callServerFnOverHttp({ id: "f1", name: "save" }, { a: 1 });

		const headers = new Headers((spy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
		expect(headers.get("flare-build")).toBe("abc");
		expect(headers.get("content-type")).toBe("application/json");
	});

	it("sends the build id on GET calls too", async () => {
		setBuildId("abc");
		const spy = vi.fn().mockResolvedValue(json({ data: 1 }));
		vi.stubGlobal("fetch", spy);

		await callServerFnOverHttp({ id: "f1", method: "get", name: "list" }, { a: 1 });

		const headers = new Headers((spy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers);
		expect(headers.get("flare-build")).toBe("abc");
	});

	it("on a build mismatch, reloads the page and rejects instead of resolving", async () => {
		setBuildId("old");
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(json({ message: "Build mismatch" }, { headers: { "flare-build": "new" }, status: 409 })),
		);

		await expect(callServerFnOverHttp({ id: "f1", name: "save" }, {})).rejects.toBeInstanceOf(BuildMismatchError);
		expect(mockRecover).toHaveBeenCalledTimes(1);
	});

	it("a plain 409 from the function itself is a normal error, not a reload", async () => {
		setBuildId("same");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(json({ message: "Conflict" }, { headers: { "flare-build": "same" }, status: 409 })),
		);

		await expect(callServerFnOverHttp({ id: "f1", name: "save" }, {})).rejects.not.toBeInstanceOf(BuildMismatchError);
		expect(mockRecover).not.toHaveBeenCalled();
	});
});
