import { FieldError, Form } from "flare/form"
import { createPage } from "flare/page"
import { createSignal, Show } from "solid-js"
import { formContactFn } from "../../form-stubs"

export const route = createPage("_root_/forms/contact").render(() => {
	const [successMsg, setSuccessMsg] = createSignal("")

	return (
		<main data-testid="form-contact">
			<h1>Contact Form</h1>
			<Show when={successMsg()}>
				<p data-testid="success-message">{successMsg()}</p>
			</Show>
			<Form
				action={formContactFn}
				onSuccess={() => {
					setSuccessMsg("Message sent!")
				}}
			>
				{(form) => (
					<>
						<div>
							<label for="email">Email</label>
							<input
								data-testid="email-input"
								id="email"
								name="email"
								type="text"
								value={form.value("email")}
							/>
							<FieldError class="field-error" field="email" of={form} />
						</div>
						<div>
							<label for="message">Message</label>
							<textarea data-testid="message-input" id="message" name="message">
								{form.value("message")}
							</textarea>
							<FieldError class="field-error" field="message" of={form} />
						</div>
						<p data-testid="has-errors">{String(form.hasErrors())}</p>
						<Show when={form.error()}>
							{(err) => <p data-testid="form-error">{err().message}</p>}
						</Show>
						<p data-testid="pending-state">{String(form.pending())}</p>
						<Show when={form.result()}>
							{(r) => <p data-testid="result-data">{JSON.stringify(r())}</p>}
						</Show>
						<button data-testid="submit-btn" disabled={form.pending()} type="submit">
							{form.pending() ? "Sending..." : "Send"}
						</button>
						<button
							data-testid="reset-btn"
							type="button"
							onClick={() => {
								form.reset()
							}}
						>
							Reset
						</button>
					</>
				)}
			</Form>
		</main>
	)
})
