import { FieldError, Form } from "flare/form"
import { createPage } from "flare/page"
import { Show } from "solid-js"
import { formUploadFn } from "../../form-stubs"

export const route = createPage("_root_/forms/upload").render(() => (
	<main data-testid="form-upload">
		<Form action={formUploadFn}>
			{(form) => (
				<>
					<input data-testid="avatar-input" name="avatar" type="file" />
					<FieldError class="field-error" field="avatar" of={form} />
					<Show when={form.result()}>
						{(r) => <p data-testid="upload-result">{JSON.stringify(r())}</p>}
					</Show>
					<button data-testid="upload-btn" type="submit">
						Upload
					</button>
				</>
			)}
		</Form>
	</main>
))
