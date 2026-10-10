import { FieldError, Form } from "@lovrozagar/flare/form";
import { createPage } from "@lovrozagar/flare/page";
import { createSignal, Show } from "solid-js";
import { formContactFn } from "../../form-stubs";

export const route = createPage("_root_/forms/contact").render(() => {
	const [successMsg, setSuccessMsg] = createSignal("");
	const [resetCount, setResetCount] = createSignal(0);

	return (
		<main data-testid="form-contact">
			<h1>Contact Form</h1>

			<Show when={successMsg()}>
				<p data-testid="success-message">{successMsg()}</p>
			</Show>

			<Form
				action={formContactFn}
				onSuccess={() => {
					setSuccessMsg("Message sent!");
				}}
			>
				{(form) => (
					<>
						<div>
							<label for="email">Email</label>
							<input data-testid="email-input" id="email" name="email" type="text" value={form.value("email")} />
							<FieldError class="field-error" field="email" of={form} />
							<FieldError all class="field-error-all" field="email" of={form} />
						</div>
						<div>
							<label for="message">Message</label>
							<textarea data-testid="message-input" id="message" name="message">
								{form.value("message")}
							</textarea>
							<FieldError class="field-error" field="message" of={form} />
						</div>
						<p data-testid="has-errors">{String(form.hasErrors())}</p>
						<Show when={form.error()}>{(err) => <p data-testid="form-error">{err().message}</p>}</Show>
						<p data-testid="pending-state">{String(form.pending())}</p>
						<Show when={form.result()}>{(r) => <p data-testid="result-data">{JSON.stringify(r())}</p>}</Show>
						<button data-testid="submit-btn" disabled={form.pending()} type="submit">
							{form.pending() ? "Sending..." : "Send"}
						</button>
						<button
							data-testid="reset-btn"
							onClick={() => {
								form.reset();
								setResetCount((c) => c + 1);
							}}
							type="button"
						>
							Reset
						</button>
						<p data-testid="reset-count">{resetCount()}</p>
					</>
				)}
			</Form>
		</main>
	);
});
