import { createPage } from "flare/page"
import { createSignal } from "solid-js"

export const route = createPage("_root_/form-demo").render(() => {
	const [result, setResult] = createSignal<string>("")
	const [error, setError] = createSignal<string>("")
	const [loading, setLoading] = createSignal(false)

	const handleSubmit = async (e: Event) => {
		e.preventDefault()
		const form = e.target as HTMLFormElement
		const data = new FormData(form)
		const message = data.get("message") as string

		setLoading(true)
		setError("")
		setResult("")

		try {
			const res = await fetch("/_fn/echo/echo", {
				body: JSON.stringify({ message }),
				headers: { "content-type": "application/json" },
				method: "POST",
			})
			if (!res.ok) {
				setError(`HTTP ${res.status}`)
				return
			}
			const json = (await res.json()) as { data: { echo: string } }
			setResult(json.data.echo)
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Unknown error")
		} finally {
			setLoading(false)
		}
	}

	return (
		<main data-testid="form-demo">
			<h1>Form Demo</h1>
			<form data-testid="echo-form" onSubmit={handleSubmit}>
				<input data-testid="message-input" name="message" type="text" />
				<button data-testid="submit-btn" type="submit">
					Send
				</button>
			</form>
			<p data-testid="form-result">{result()}</p>
			<p data-testid="form-error">{error()}</p>
			<p data-testid="form-loading">{String(loading())}</p>
		</main>
	)
})
