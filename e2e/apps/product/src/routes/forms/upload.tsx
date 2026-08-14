import { FieldError, Form } from "flare/form"
import { createPage } from "flare/page"
import { Show } from "solid-js"
import { formUploadFn } from "../../form-stubs"

export const route = createPage("_root_/forms/upload").render(() => (
	<main data-testid="form-upload">
		<h1>File Upload</h1>
		<Form action={formUploadFn} enctype="multipart/form-data">
			{(form) => (
				<>
					<div>
						<label for="avatar">Avatar</label>
						<input
							accept="image/*"
							data-testid="file-input"
							id="avatar"
							name="avatar"
							type="file"
						/>
						<FieldError class="field-error" field="avatar" of={form} />
					</div>
					<Show when={form.result()}>
						{(r) => <p data-testid="result-data">{JSON.stringify(r())}</p>}
					</Show>
					<button data-testid="submit-btn" disabled={form.pending()} type="submit">
						Upload
					</button>
				</>
			)}
		</Form>
	</main>
))
