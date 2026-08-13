import { createPage } from "flare/page"

export const route = createPage("_root_/(opt-single-param)/opt-single-param/[[lang]]/")
	.loader((ctx) => {
		const lang = ctx.location.params.lang ?? "default"
		const greetings: Record<string, string> = { de: "Hallo", es: "Hola", fr: "Bonjour" }
		const greeting = greetings[lang] ?? "Hello"
		return { greeting, lang }
	})
	.head((ctx) => ({ title: `Lang: ${ctx.loaderData.lang}` }))
	.render((props) => (
		<main data-testid="opt-single-index">
			<h1 data-testid="lang-value">{props.loaderData.lang}</h1>
			<p data-testid="opt-greeting">{props.loaderData.greeting}</p>
		</main>
	))
