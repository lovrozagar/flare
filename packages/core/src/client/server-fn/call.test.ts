import { expect, it, vi } from "vitest";
import { callServerFn, ServerFnError, type CallDeps } from "./call.ts";

const echo = { id: "0123456789abcdef", name: "echo", record: { method: "post" as const } };

type Answer = { body: BodyInit | null; status?: number; headers?: Record<string, string> };

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Answer {
	return { body: JSON.stringify(value), status, headers: { "content-type": "application/json", ...headers } };
}

function deps(answer: Answer, extra: Partial<CallDeps> = {}) {
	const fetch = vi.fn<CallDeps["fetch"]>(
		async () => new Response(answer.body, { status: answer.status ?? 200, headers: answer.headers ?? {} }),
	);
	const go = vi.fn<CallDeps["go"]>();
	const assign = vi.fn<CallDeps["assign"]>();
	const reload = vi.fn<CallDeps["reload"]>(() => true);
	const base: CallDeps = {
		fetch,
		go,
		assign,
		reload,
		origin: "http://localhost",
		basePath: "/",
		build: "b1",
		href: () => "http://localhost/page",
	};
	return { ...base, ...extra, fetch, go, assign, reload };
}

async function rejection(promise: Promise<unknown>): Promise<ServerFnError> {
	const error: unknown = await promise.then(
		() => undefined,
		(caught: unknown) => caught,
	);
	if (!(error instanceof ServerFnError)) throw new Error("did not reject with a ServerFnError");
	return error;
}

it("posts", async () => {
	const call = deps(json({ name: "echo", status: 200, data: { n: 1 } }));
	expect(await callServerFn(echo, { a: 1 }, call)).toEqual({ n: 1 });
	const [url, init] = call.fetch.mock.calls[0];
	expect(url).toBe("/_flare/fn/0123456789abcdef");
	expect(init.method).toBe("POST");
	expect(init.body).toBe('{"a":1}');
});

it("reject", async () => {
	const production = await rejection(
		callServerFn(
			echo,
			1,
			deps(json({ name: "echo", status: 500, message: "Something went wrong", digest: "abc" }, 500)),
		),
	);
	expect(production).toBeInstanceOf(Error);
	expect(production).toMatchObject({ message: "Something went wrong", status: 500, digest: "abc" });
	const dev = await rejection(
		callServerFn(
			echo,
			1,
			deps(json({ name: "echo", status: 500, message: "boom", stack: "Error: boom\n    at x" }, 500)),
		),
	);
	expect(dev.stack).toBe("Error: boom\n    at x");
	expect(dev.digest).toBeUndefined();
	const errors = { issues: [{ message: "bad", path: ["n"] }], fieldErrors: { n: ["bad"] } };
	const invalid = await rejection(
		callServerFn(echo, 1, deps(json({ name: "echo", status: 400, message: "Invalid input", errors }, 400))),
	);
	expect(invalid).toMatchObject({ status: 400, ...errors });
	// A same-origin redirect is the internal URL navigation, and the promise still rejects.
	const redirect = { to: "/login?next=a#top", status: 303, replace: true };
	const inside = deps(json({ name: "echo", status: 303, redirect }));
	expect(await rejection(callServerFn(echo, 1, inside))).toMatchObject({ status: 303, redirect });
	expect(inside.go).toHaveBeenCalledExactlyOnceWith("/login?next=a#top", true);
	expect(inside.assign).not.toHaveBeenCalled();
	const away = { to: "https://example.com/a", status: 303, replace: false };
	const outside = deps(json({ name: "echo", status: 303, redirect: away }));
	await rejection(callServerFn(echo, 1, outside));
	expect(outside.assign).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
	expect(outside.go).not.toHaveBeenCalled();
	// A bare status has no envelope.
	expect(await rejection(callServerFn(echo, 1, deps({ body: null, status: 405 })))).toMatchObject({
		message: "HTTP 405",
		status: 405,
	});
	expect(await rejection(callServerFn(echo, 1, deps(json([1], 500))))).toMatchObject({ message: "HTTP 500" });
	// A returned Response is the HTTP response, so the call resolves to it.
	const made = await callServerFn(echo, 1, deps({ body: "made", status: 201 }));
	expect(made).toBeInstanceOf(Response);
	expect(made instanceof Response && (await made.text())).toBe("made");
});

it("untrusted envelope", async () => {
	// A malformed issue keeps what it can, and anything else is dropped.
	const loose = { issues: [{ message: "bad", path: ["n"] }, { path: ["x"] }, { message: "loose", path: "n" }] };
	const kept = await rejection(callServerFn(echo, 1, deps(json({ status: 400, errors: loose }, 400))));
	expect(kept).toMatchObject({
		issues: [
			{ message: "bad", path: ["n"] },
			{ message: "loose", path: [] },
		],
		fieldErrors: { n: ["bad"] },
	});
	const none = await rejection(callServerFn(echo, 1, deps(json({ status: 400, errors: { issues: "x" } }, 400))));
	expect(none).toMatchObject({ issues: [], fieldErrors: {} });
	expect(await rejection(callServerFn(echo, 1, deps(json({ message: "no status" }, 502))))).toMatchObject({
		message: "HTTP 502",
	});
});

it("build mismatch", async () => {
	const stale = deps(json({ name: "echo", status: 200, data: 1 }, 200, { "flare-build": "b2" }));
	expect(await rejection(callServerFn(echo, 1, stale))).toMatchObject({ status: 200 });
	expect(stale.reload).toHaveBeenCalledExactlyOnceWith("http://localhost/page");
	const missing = deps(json({ name: "echo", status: 200, data: 1 }));
	expect(await callServerFn(echo, 1, missing)).toBe(1);
	const unbuilt = deps(json({ name: "echo", status: 200, data: 2 }, 200, { "flare-build": "b2" }), { build: "" });
	expect(await callServerFn(echo, 1, unbuilt)).toBe(2);
	expect(missing.reload).not.toHaveBeenCalled();
	expect(unbuilt.reload).not.toHaveBeenCalled();
});
