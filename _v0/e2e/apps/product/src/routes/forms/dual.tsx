import { FieldError, Form } from "@lovrozagar/flare/form";
import { createPage } from "@lovrozagar/flare/page";
import { Show } from "solid-js";
import { formDualAFn, formDualBFn } from "../../form-stubs";

export const route = createPage("_root_/forms/dual").render(() => {
	return (
		<main data-testid="form-dual">
			<h1>Dual Forms</h1>

			<section data-testid="form-a-section">
				<h2>Form A ({"{parse}"} protocol)</h2>
				<Form action={formDualAFn}>
					{(form) => (
						<>
							<div>
								<label for="nameA">Name A</label>
								<input data-testid="nameA-input" id="nameA" name="nameA" type="text" value={form.value("nameA")} />
								<FieldError class="field-error" field="nameA" of={form} />
							</div>
							<Show when={form.result()}>{(r) => <p data-testid="resultA-data">{JSON.stringify(r())}</p>}</Show>
							<button data-testid="submitA-btn" disabled={form.pending()} type="submit">
								Submit A
							</button>
						</>
					)}
				</Form>
			</section>

			<section data-testid="form-b-section">
				<h2>Form B (function validator)</h2>
				<Form action={formDualBFn}>
					{(form) => (
						<>
							<div>
								<label for="nameB">Name B</label>
								<input data-testid="nameB-input" id="nameB" name="nameB" type="text" value={form.value("nameB")} />
								<FieldError class="field-error" field="nameB" of={form} />
							</div>
							<Show when={form.result()}>{(r) => <p data-testid="resultB-data">{JSON.stringify(r())}</p>}</Show>
							<button data-testid="submitB-btn" disabled={form.pending()} type="submit">
								Submit B
							</button>
						</>
					)}
				</Form>
			</section>
		</main>
	);
});
