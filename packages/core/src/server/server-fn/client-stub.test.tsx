import { createComponent, createEffect, createMemo, createRoot, flush, onSettled } from "solid-js";
import { expect, it, vi } from "vitest";
import { createServerFn, type ServerFnRef } from "./builder.ts";

// The client graph's callable runs Solid's browser build, so these rows live in the jsdom project.

type Transport = (fn: ServerFnRef, input: unknown) => Promise<unknown>;

// The transform writes `__client` in the client graph. It is not typed config, so it arrives untyped.
const clientConfig = { method: "post" as const, __id: "stub-id", __name: "stub", __client: true };

// The client graph never runs the validator. It is here so the stub takes an argument.
const raw = (value: unknown): unknown => value;

function stubbed() {
	const secret = vi.fn<() => string>(() => "secret");
	const transport = vi.fn<Transport>(async () => "sent");
	return { secret, transport, stub: createServerFn(clientConfig, transport).input(raw).handler(secret) };
}

function caught(run: () => unknown): unknown {
	try {
		run();
		return undefined;
	} catch (error) {
		return error;
	}
}

it("client stub", async () => {
	const { secret, transport, stub } = stubbed();
	const thrown: unknown[] = [];
	createRoot(() => {
		createComponent(() => {
			thrown.push(caught(() => stub(1)));
			return null;
		}, {});
	});
	expect(String(thrown[0])).toMatch(/stub was called during a render/);
	expect(transport).not.toHaveBeenCalled();
	expect(await stub(1)).toBe("sent");
	expect(transport).toHaveBeenCalledExactlyOnceWith(stub, 1);
	expect(secret).not.toHaveBeenCalled();
	expect(() => createServerFn(clientConfig).handler(secret)).toThrow(/client transport/);
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
	const thrown: unknown[] = [];
	const dispose = createRoot((done) => {
		createComponent(() => {
			onSettled(() => void thrown.push(caught(() => stub(1))));
			return null;
		}, {});
		return done;
	});
	flush();
	expect(String(thrown[0])).toMatch(/during a render/);
	expect(transport).not.toHaveBeenCalled();
	dispose();
});
