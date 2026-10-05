import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form } from "../../../src/form/index.tsx";
import type { ServerFn, ServerFnRegistration } from "../../../src/server-fn/index.ts";

/* A consumer onSubmit (client validation, e.g. Base UI Form through `render`) runs before the
   server call; preventing the default cancels it. Flare used to replace the handler. */

function mockServerFn(): ServerFn<unknown, unknown> {
	const fn = vi.fn() as unknown as ServerFn<unknown, unknown>;
	fn._registration = {
		authenticate: false,
		fn: async (ctx: { input: unknown }) => ctx.input,
		id: "fn-id",
		method: "post",
		name: "save",
		stream: false,
	} as ServerFnRegistration;
	return fn;
}

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.unstubAllGlobals();
});

function mount(onSubmit: (event: SubmitEvent) => void): HTMLFormElement {
	const container = document.createElement("div");
	document.body.appendChild(container);
	containers.push(container);
	render(
		() => (
			<Form action={mockServerFn()} onSubmit={onSubmit}>
				{() => <input name="email" value="a@b.c" />}
			</Form>
		),
		container,
	);
	return container.querySelector("form") as HTMLFormElement;
}

const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

describe("Form consumer onSubmit", () => {
	it("runs before the server call and cancels it by preventing the default", () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} })));
		vi.stubGlobal("fetch", fetchMock);
		const order: string[] = [];
		const form = mount((event) => {
			order.push("consumer");
			event.preventDefault();
		});
		submit(form);
		expect(order).toEqual(["consumer"]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("lets the server call proceed when the consumer doesn't prevent it", () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} })));
		vi.stubGlobal("fetch", fetchMock);
		const consumer = vi.fn();
		const form = mount(consumer);
		const notCanceled = submit(form);
		expect(consumer).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		/* The server call still keeps the browser from navigating. */
		expect(notCanceled).toBe(false);
	});
});
