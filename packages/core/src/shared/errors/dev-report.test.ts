import { expect, it, vi } from "vitest";
import { devErrorPayload, reportDevError, type DevErrorPayload } from "./dev-report.ts";

it("payload", () => {
	const payload = devErrorPayload(new Error("secret"));
	expect(payload).toEqual({ type: "error", err: { message: "secret", stack: expect.any(String) } });
	expect(payload.err.stack).toMatch(/\n\s+at /);
});

it("string", () => {
	expect(devErrorPayload("secret")).toEqual({ type: "error", err: { message: "secret", stack: "" } });
});

it("sends", () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const error = new Error("boom");
	reportDevError(error, send);
	expect(send).toHaveBeenCalledExactlyOnceWith(devErrorPayload(error));
});

it("no send", () => {
	expect(() => reportDevError(new Error("boom"))).not.toThrow();
});
