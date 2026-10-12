import { expect, it, vi } from "vitest";
import { notFound, redirect, unauthenticated, unauthorized } from "../../shared/errors/index.ts";
import { markSafeError } from "../../shared/errors/safe.ts";
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts";
import type { Logger } from "../lifecycle/logger.ts";
import type { ErrorSink } from "../render/projector.ts";
import { errorEnvelope, okEnvelope } from "./envelope.ts";

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop };

function sink(dev: boolean): ErrorSink & { send: ReturnType<typeof vi.fn<(payload: DevErrorPayload) => void>> } {
	return { dev, send: vi.fn<(payload: DevErrorPayload) => void>(), log: quiet };
}

function thrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error("did not throw");
}

it("ok", () => {
	expect(okEnvelope("echo", { n: 1 })).toEqual({ name: "echo", status: 200, data: { n: 1 } });
});

it("thrown secret", () => {
	const production = sink(false);
	const answer = errorEnvelope("echo", new Error("secret"), { sink: production, basePath: "/" });
	expect(answer.http).toBe(500);
	expect(answer.envelope.message).not.toContain("secret");
	expect(answer.envelope.digest).toMatch(/^[0-9a-f]{12}$/);
	expect(answer.envelope).not.toHaveProperty("stack");
	expect(answer.envelope.name).toBe("echo");
	expect(production.send).not.toHaveBeenCalled();
});

it("dev stack", () => {
	const dev = sink(true);
	const answer = errorEnvelope("echo", new Error("secret"), { sink: dev, basePath: "/" });
	expect(answer.envelope.message).toBe("secret");
	expect(answer.envelope.stack).toMatch(/envelope\.test\.ts/);
	expect(answer.envelope).not.toHaveProperty("digest");
	expect(dev.send).toHaveBeenCalledOnce();
});

it("safe", () => {
	const answer = errorEnvelope("echo", markSafeError(new Error("visible")), { sink: sink(false), basePath: "/" });
	expect(answer.envelope.message).toBe("visible");
	expect(answer.envelope.digest).toMatch(/^[0-9a-f]{12}$/);
	expect(answer.envelope).not.toHaveProperty("stack");
});

it("redirect", () => {
	const dev = sink(true);
	const error = thrown(() => redirect({ to: "_root_/about", search: { q: "1" }, hash: "top" }));
	expect(errorEnvelope("echo", error, { sink: dev, basePath: "/" })).toEqual({
		http: 200,
		envelope: { name: "echo", status: 303, redirect: { to: "/about?q=1#top", status: 303, replace: true } },
	});
	const kept = thrown(() => redirect({ to: "_root_/about", status: 307, replace: false }));
	expect(errorEnvelope("echo", kept, { sink: dev, basePath: "/app" }).envelope.redirect).toEqual({
		to: "/app/about",
		status: 307,
		replace: false,
	});
	expect(dev.send).not.toHaveBeenCalled();
});

it("href", () => {
	const error = thrown(() => redirect({ href: "https://example.com/a" }));
	expect(errorEnvelope("echo", error, { sink: sink(false), basePath: "/" })).toEqual({
		http: 200,
		envelope: { name: "echo", status: 303, redirect: { to: "https://example.com/a", status: 303, replace: true } },
	});
});

it("helpers", () => {
	const dev = sink(true);
	const cases: Array<[() => never, number]> = [
		[notFound, 404],
		[unauthenticated, 401],
		[unauthorized, 403],
	];
	for (const [helper, status] of cases) {
		const answer = errorEnvelope("echo", thrown(helper), { sink: dev, basePath: "/" });
		expect(answer.http).toBe(status);
		expect(answer.envelope.status).toBe(status);
		expect(answer.envelope).not.toHaveProperty("stack");
	}
	expect(dev.send).not.toHaveBeenCalled();
});
