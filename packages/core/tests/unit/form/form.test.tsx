import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form, type FormContext } from "../../../src/form/index.tsx";
import type { ServerFn, ServerFnRegistration } from "../../../src/server-fn/index.ts";

/* ── helpers ───────────────────────────────────────────────────────── */

function mockServerFn<TInput, TOutput>(overrides?: Partial<ServerFnRegistration>): ServerFn<TInput, TOutput> {
	const fn = vi.fn() as unknown as ServerFn<TInput, TOutput>;
	fn._registration = {
		authenticate: false,
		fn: async (ctx: { input: unknown }) => ctx.input,
		id: "test-fn-id",
		method: "post",
		name: "testFn",
		stream: false,
		...overrides,
	} as ServerFnRegistration;
	return fn;
}

let container: HTMLDivElement;

function setup(): void {
	container = document.createElement("div");
	document.body.appendChild(container);
}

afterEach(() => {
	if (container) {
		container.remove();
	}
});

/* ── C1: Renders form element ─────────────────────────────────────── */

describe("Form component", () => {
	it("C1: renders form with method=post and hidden __flare_fn input", () => {
		setup();
		const action = mockServerFn();
		render(() => <Form action={action}>{() => <button type="submit">Submit</button>}</Form>, container);
		const form = container.querySelector("form");
		expect(form).toBeTruthy();
		expect(form?.getAttribute("method")).toBe("post");
		const hidden = form?.querySelector("input[name='__flare_fn']") as HTMLInputElement | null;
		expect(hidden).toBeTruthy();
		expect(hidden?.type).toBe("hidden");
	});

	/* C2: Hidden input has fnId */
	it("C2: hidden input value matches registration id", () => {
		setup();
		const action = mockServerFn({ id: "my-fn-123" });
		render(() => <Form action={action}>{() => <span>child</span>}</Form>, container);
		const hidden = container.querySelector("input[name='__flare_fn']") as HTMLInputElement | null;
		expect(hidden?.value).toBe("my-fn-123");
	});

	/* C3: Passes through attrs */
	it("C3: passes through class, id, style attributes", () => {
		setup();
		const action = mockServerFn();
		render(
			() => (
				<Form action={action} class="my-form" id="form1">
					{() => <span>child</span>}
				</Form>
			),
			container,
		);
		const form = container.querySelector("form");
		expect(form?.getAttribute("class")).toBe("my-form");
		expect(form?.getAttribute("id")).toBe("form1");
	});

	/* C4: enctype prop */
	it("C4: sets enctype attribute", () => {
		setup();
		const action = mockServerFn();
		render(
			() => (
				<Form action={action} enctype="multipart/form-data">
					{() => <span>child</span>}
				</Form>
			),
			container,
		);
		const form = container.querySelector("form");
		expect(form?.getAttribute("enctype")).toBe("multipart/form-data");
	});

	/* C5: Render prop receives context */
	it("C5: render prop receives form context with all accessors", () => {
		setup();
		const action = mockServerFn();
		let capturedCtx: FormContext<unknown> | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						capturedCtx = form;
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(capturedCtx).toBeDefined();
		expect(typeof capturedCtx?.pending).toBe("function");
		expect(typeof capturedCtx?.error).toBe("function");
		expect(typeof capturedCtx?.fieldErrors).toBe("function");
		expect(typeof capturedCtx?.result).toBe("function");
		expect(typeof capturedCtx?.value).toBe("function");
		expect(typeof capturedCtx?.reset).toBe("function");
	});

	/* C6: form.pending initial */
	it("C6: form.pending is false initially", () => {
		setup();
		const action = mockServerFn();
		let pending: boolean | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						pending = form.pending();
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(pending).toBe(false);
	});

	/* C7: form.fieldErrors initial */
	it("C7: form.fieldErrors is empty object initially", () => {
		setup();
		const action = mockServerFn();
		let fieldErrors: Record<string, string[]> | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						fieldErrors = form.fieldErrors();
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(fieldErrors).toEqual({});
	});

	/* C8: form.error initial */
	it("C8: form.error is null initially", () => {
		setup();
		const action = mockServerFn();
		let error: Error | null | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						error = form.error();
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(error).toBeNull();
	});

	/* C9: form.result initial */
	it("C9: form.result is undefined initially", () => {
		setup();
		const action = mockServerFn();
		let result: unknown;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						result = form.result();
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(result).toBeUndefined();
	});

	/* C10: form.reset clears state */
	it("C10: form.reset clears all state back to initial", () => {
		setup();
		const action = mockServerFn();
		let ctx: FormContext<unknown> | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						ctx = form;
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(ctx).toBeDefined();
		ctx?.reset();
		expect(ctx?.pending()).toBe(false);
		expect(ctx?.error()).toBeNull();
		expect(ctx?.fieldErrors()).toEqual({});
		expect(ctx?.result()).toBeUndefined();
	});

	/* ── C11–C17: hasErrors accessor ──────────────────────────────────── */

	/* C11: hasErrors is a function on context */
	it("C11: render prop receives hasErrors accessor", () => {
		setup();
		const action = mockServerFn();
		let ctx: FormContext<unknown> | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						ctx = form;
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(typeof ctx?.hasErrors).toBe("function");
	});

	/* C12: hasErrors false initially */
	it("C12: hasErrors returns false when no errors exist", () => {
		setup();
		const action = mockServerFn();
		let hasErrors: boolean | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						hasErrors = form.hasErrors();
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		expect(hasErrors).toBe(false);
	});

	/* C13: hasErrors false after reset */
	it("C13: hasErrors returns false after reset", () => {
		setup();
		const action = mockServerFn();
		let ctx: FormContext<unknown> | undefined;
		render(
			() => (
				<Form action={action}>
					{(form) => {
						ctx = form;
						return <span>child</span>;
					}}
				</Form>
			),
			container,
		);
		ctx?.reset();
		expect(ctx?.hasErrors()).toBe(false);
	});
});
