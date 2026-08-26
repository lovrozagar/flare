import { createMemo, createSignal, For, omit, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import type { FlattenedError } from "../errors/index.ts";
import { ServerFnValidationError } from "../errors/index.ts";
import { FORM_FN_FIELD, serverFnPath } from "../protocol.ts";
import type { ServerFn } from "../server-fn/index.ts";

/* Duplicated here to avoid importing server-context (uses node:async_hooks)
 * into this client-renderable module. Canonical definition in server-context. */
export interface FormActionContext {
	fieldErrors: Record<string, string[]>;
	formErrors: string[];
	message: string;
	values: Record<string, unknown>;
}

/* ── SSR form action context bridge ────────────────────────────────── */

let _getFormActionContext: ((fnId: string) => FormActionContext | undefined) | undefined;

/**
 * Wire up SSR form context reading. Called once by server-handler
 * to avoid runtime import of server-context (uses node:async_hooks)
 * from this client-renderable component.
 */
export function registerFormActionContextGetter(getter: (fnId: string) => FormActionContext | undefined): void {
	_getFormActionContext = getter;
}

/* ── Form context (render prop) ────────────────────────────────────── */

export interface FormContext<TOutput> {
	error: () => Error | null;
	fieldErrors: () => Record<string, string[]>;
	hasErrors: () => boolean;
	pending: () => boolean;
	reset: () => void;
	result: () => TOutput | undefined;
	value: (field: string) => string;
}

/* ── Form props ────────────────────────────────────────────────────── */

interface FormOwnProps<TInput, TOutput> {
	action: ServerFn<TInput, TOutput>;
	children: (form: FormContext<TOutput>) => JSX.Element;
	enctype?: JSX.FormHTMLAttributes<HTMLFormElement>["enctype"];
	onError?: (error: Error) => void;
	onSuccess?: (data: TOutput) => void;
}

export type FormProps<TInput, TOutput> = FormOwnProps<TInput, TOutput> &
	Omit<JSX.FormHTMLAttributes<HTMLFormElement>, "action" | "children" | "enctype" | "method">;

/** Seed `form.error()` after a no-JS PE POST with form-level validation errors. */
export function seedFormErrorFromSsr(ssrCtx: FormActionContext | undefined): Error | null {
	if (!ssrCtx?.formErrors.length) return null;
	return new ServerFnValidationError({
		fieldErrors: ssrCtx.fieldErrors,
		formErrors: ssrCtx.formErrors,
	});
}

/* ── Form component ────────────────────────────────────────────────── */

export function Form<TInput, TOutput>(props: FormProps<TInput, TOutput>): JSX.Element {
	const local = props as FormOwnProps<TInput, TOutput> & Record<string, unknown>;
	const rest = omit(local, "action", "children", "enctype", "onError", "onSuccess");

	const reg = createMemo(() => local.action._registration);
	const fnId = createMemo(() => reg()?.id ?? "");
	const fnName = createMemo(() => reg()?.name ?? "");

	/* SSR error context — populated on server after PE POST validation failure */
	const ssrCtx = typeof window === "undefined" && _getFormActionContext ? _getFormActionContext(fnId()) : undefined;

	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<Error | null>(seedFormErrorFromSsr(ssrCtx));
	const [fieldErrors, setFieldErrors] = createSignal<Record<string, string[]>>(ssrCtx?.fieldErrors ?? {});
	const [result, setResult] = createSignal<TOutput | undefined>(undefined);

	function valueFn(field: string): string {
		if (typeof window !== "undefined") return "";
		if (!ssrCtx) return "";
		const v = ssrCtx.values[field];
		if (typeof v === "string") return v;
		if (Array.isArray(v)) return v[0] ?? "";
		return "";
	}

	function reset(): void {
		setPending(false);
		setError(null);
		setFieldErrors({});
		setResult(undefined);
	}

	const formCtx: FormContext<TOutput> = {
		error,
		fieldErrors,
		hasErrors: () => error() !== null || Object.keys(fieldErrors()).length > 0,
		pending,
		reset,
		result,
		value: valueFn,
	};

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (pending()) return;

		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);
		const id = fnId();
		const name = fnName();

		if (!id || !name) return;

		setPending(true);
		setError(null);
		setFieldErrors({});

		try {
			const url = serverFnPath(id, name);
			const res = await fetch(url, {
				body: formData,
				method: "POST",
			});

			if (res.ok) {
				const json = (await res.json()) as { data: TOutput };
				setResult(() => json.data);
				local.onSuccess?.(json.data);
			} else {
				const body: unknown = await res.json().catch(() => null);
				if (typeof body === "object" && body !== null && "errors" in body) {
					const errors = (body as { errors: FlattenedError }).errors;
					setFieldErrors(errors.fieldErrors ?? {});
					if (errors.formErrors && errors.formErrors.length > 0) {
						const err = new ServerFnValidationError(errors);
						setError(err);
						local.onError?.(err);
					}
				} else {
					/* Surface upstream API error verbatim — accept either `error` (anyrow gateway,
					   many REST APIs) or `message` (Hono / express default) so Form works against
					   any reasonable error envelope without server-fn handlers having to rewrap. */
					const rec = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
					let msg = "Request failed";
					if (rec && typeof rec.error === "string") msg = rec.error;
					else if (rec && typeof rec.message === "string") msg = rec.message;
					const err = new Error(msg);
					setError(err);
					local.onError?.(err);
				}
			}
		} catch (e: unknown) {
			const err = e instanceof Error ? e : new Error("Network error");
			setError(err);
			local.onError?.(err);
		} finally {
			setPending(false);
		}
	}

	return (
		<form
			{...(rest as JSX.FormHTMLAttributes<HTMLFormElement>)}
			enctype={local.enctype}
			method="post"
			onSubmit={handleSubmit}
		>
			<input name={FORM_FN_FIELD} type="hidden" value={fnId()} />
			{local.children(formCtx)}
		</form>
	) as JSX.Element;
}

/* ── FieldError component ──────────────────────────────────────────── */

interface FieldErrorProps<TOutput> {
	all?: boolean;
	as?: string;
	class?: string;
	field: string;
	of: FormContext<TOutput>;
}

export function FieldError<TOutput>(props: FieldErrorProps<TOutput>): JSX.Element {
	const errors = createMemo(() => {
		const all = props.of.fieldErrors();
		const arr = all[props.field];
		if (!arr || arr.length === 0) return undefined;
		return props.all ? arr : [arr[0]];
	});

	return (
		<Show when={errors()}>
			{(msgs) => (
				<For each={msgs()}>
					{(msg) => (
						<Dynamic class={props.class} component={props.as ?? "p"}>
							{msg}
						</Dynamic>
					)}
				</For>
			)}
		</Show>
	) as JSX.Element;
}
