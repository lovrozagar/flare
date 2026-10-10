import { FieldError, Form } from "@lovrozagar/flare/form";
import { createPage } from "@lovrozagar/flare/page";
import { Show } from "solid-js";
import { formMultiFn } from "../../form-stubs";

export const route = createPage("_root_/forms/multi").render(() => {
	return (
		<main data-testid="form-multi">
			<h1>Multi-Value Form</h1>
			<Form action={formMultiFn}>
				{(form) => (
					<>
						<fieldset>
							<legend>Tags</legend>
							<label>
								<input data-testid="tag-alpha" name="tags" type="checkbox" value="alpha" />
								Alpha
							</label>
							<label>
								<input data-testid="tag-beta" name="tags" type="checkbox" value="beta" />
								Beta
							</label>
							<label>
								<input data-testid="tag-gamma" name="tags" type="checkbox" value="gamma" />
								Gamma
							</label>
							<FieldError class="field-error" field="tags" of={form} />
						</fieldset>
						<Show when={form.result()}>{(r) => <p data-testid="result-data">{JSON.stringify(r())}</p>}</Show>
						<button data-testid="submit-btn" disabled={form.pending()} type="submit">
							Submit
						</button>
					</>
				)}
			</Form>
		</main>
	);
});
