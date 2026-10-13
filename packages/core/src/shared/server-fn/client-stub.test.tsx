import { createComponent, createEffect, createMemo, createRoot, flush, onSettled } from "solid-js";
import { expect, it, vi } from "vitest";
import { bindServerFn, type ServerFnRef } from "./builder.ts";

// The client graph's callable runs Solid's browser build, so these rows live in the jsdom project.

type Transport = (fn: ServerFnRef, input: unknown) => Promise<unknown>;

// The transform writes `__client` in the client graph. It is not typed config, so it arrives untyped.
const clientConfig = { method: "post" as const, __id: "stub-id", __name: "stub", __client: true };

// The client graph never runs the validator. It is here so the stub takes an argument.
const raw = (value: unknown): unknown => value;

function stubbed() {
	const secret = vi.fn<() => string>(() => "secret");
	const transport = vi.fn<Transport>(async () => "sent");
	return { secret, transport, stub: bindServerFn(transport)(clientConfig).input(raw).handler(secret) };
}

function caught(run: () => unknown): unknown {
	try {
		run();
		return undefined;
	} catch (error) {
		return error;
	}
}

// The render check is a heuristic, so a direct call in a render warns in dev and still calls (BUGS.md B36). Vite
// replaces `import.meta.env.DEV` with false in a production bundle, which drops the check.
it("client stub", async () => {
	const { secret, transport, stub } = stubbed();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const sent: unknown[] = [];
	createRoot(() => {
		createComponent(() => {
			sent.push(stub(1));
			return null;
		}, {});
	});
	expect(await sent[0]).toBe("sent");
	expect(warn).toHaveBeenCalledExactlyOnceWith(
		expect.stringMatching(/^\[flare:server-fn\] stub was called during a render/),
	);
	expect(transport).toHaveBeenCalledExactlyOnceWith(stub, 1);
	vi.stubEnv("DEV", false);
	createRoot(() => createComponent(() => void stub(2), {}));
	vi.unstubAllEnvs();
	expect(warn).toHaveBeenCalledOnce();
	expect(transport).toHaveBeenCalledTimes(2);
	expect(secret).not.toHaveBeenCalled();
	warn.mockRestore();
});

it("memo call", async () => {
	const { transport, stub } = stubbed();
	const thrown: unknown[] = [];
	const dispose = createRoot((done) => {
		const memo = createMemo(() => caught(() => stub("memo")));
		createEffect(
			() => caught(() => stub("compute")),
			(value) => {
				thrown.push(
					memo(),
					value,
					caught(() => stub("callback")),
				);
			},
		);
		return done;
	});
	flush();
	expect(thrown).toEqual([undefined, undefined, undefined]);
	expect(transport.mock.calls.map((call) => call[1])).toEqual(["memo", "compute", "callback"]);
	dispose();
});

it("on settled", () => {
	const { transport, stub } = stubbed();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const thrown: unknown[] = [];
	const dispose = createRoot((done) => {
		createComponent(() => {
			onSettled(() => void thrown.push(caught(() => stub(1))));
			return null;
		}, {});
		return done;
	});
	flush();
	expect(thrown).toEqual([undefined]);
	expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/during a render/));
	expect(transport).toHaveBeenCalledExactlyOnceWith(stub, 1);
	warn.mockRestore();
	dispose();
});
