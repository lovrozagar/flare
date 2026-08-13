import { FieldError, Form } from "flare/form"
import { createPage } from "flare/page"
import { createSignal, Show } from "solid-js"
import { formContactFn } from "../form-stubs"

export const route = createPage("_root_/a11y-form-test").render(() => {
	const [submitted, setSubmitted] = createSignal(false)

	return (
		<main aria-label="Accessible form test" data-testid="a11y-form-page">
			<h1>Accessible Form</h1>

			<Show when={submitted()}>
				<div data-testid="success-alert" role="alert">
					<p>Form submitted successfully!</p>
				</div>
			</Show>

			<Form action={formContactFn} onSuccess={() => setSubmitted(true)}>
				{(form) => (
					<fieldset data-testid="contact-fieldset">
						<legend>Contact Information</legend>

						<div>
							<label for="a11y-email">
								Email <abbr title="required">*</abbr>
							</label>
							<input
								aria-describedby="email-hint email-error"
								aria-invalid={form.hasErrors() ? "true" : undefined}
								aria-required="true"
								autocomplete="email"
								data-testid="a11y-email-input"
								id="a11y-email"
								name="email"
								type="email"
								value={form.value("email")}
							/>
							<span data-testid="email-hint" id="email-hint">
								Enter your email address
							</span>
							<FieldError class="field-error" field="email" of={form} />
							<span aria-live="assertive" data-testid="email-error-live" id="email-error">
								<FieldError field="email" of={form} />
							</span>
						</div>

						<div>
							<label for="a11y-message">Message</label>
							<textarea
								aria-describedby="message-hint"
								data-testid="a11y-message-input"
								id="a11y-message"
								name="message"
								rows="4"
							>
								{form.value("message")}
							</textarea>
							<span data-testid="message-hint" id="message-hint">
								Describe your inquiry
							</span>
							<FieldError class="field-error" field="message" of={form} />
						</div>

						<fieldset data-testid="preference-group">
							<legend id="pref-legend">Contact preference</legend>
							<label>
								<input name="preference" type="radio" value="email" />
								Email
							</label>
							<label>
								<input name="preference" type="radio" value="phone" />
								Phone
							</label>
						</fieldset>

						<div>
							<label for="a11y-terms">
								<input
									data-testid="a11y-terms-input"
									id="a11y-terms"
									name="terms"
									type="checkbox"
								/>
								I agree to the terms
							</label>
						</div>

						<Show when={form.error()}>
							{(err) => (
								<div data-testid="form-error-alert" role="alert">
									<p>{err().message}</p>
								</div>
							)}
						</Show>

						<button
							aria-busy={form.pending()}
							data-testid="a11y-submit-btn"
							disabled={form.pending()}
							type="submit"
						>
							{form.pending() ? "Submitting..." : "Submit"}
						</button>
					</fieldset>
				)}
			</Form>
		</main>
	)
})
