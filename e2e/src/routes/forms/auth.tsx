import { FieldError, Form } from "flare/form"
import { createPage } from "flare/page"
import { Show } from "solid-js"
import { formAuthFn } from "../../form-stubs"

export const route = createPage("_root_/forms/auth").render(() => {
	return (
		<main data-testid="form-auth">
			<h1>Authenticated Form</h1>
			<Form action={formAuthFn}>
				{(form) => (
					<>
						<div>
							<label for="note">Note</label>
							<input data-testid="note-input" id="note" name="note" type="text" />
							<FieldError class="field-error" field="note" of={form} />
						</div>
						<Show when={form.error()}>
							{(err) => <p data-testid="form-error">{err().message}</p>}
						</Show>
						<Show when={form.result()}>
							{(r) => <p data-testid="result-data">{JSON.stringify(r())}</p>}
						</Show>
						<button data-testid="submit-btn" disabled={form.pending()} type="submit">
							Submit
						</button>
					</>
				)}
			</Form>
		</main>
	)
})
