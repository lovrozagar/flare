import { createPage } from "flare/page"

export const route = createPage("_root_/(optional-locale)/optional-locale/[[...locale]]/")
	.loader((ctx) => {
		const raw = ctx.location.params.locale
		const segments = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []
		const locale = segments[0] ?? "default"
		return { locale }
	})
	.render((props) => (
		<main data-testid="optional-locale">
			<h1 data-testid="locale-value">{props.loaderData.locale}</h1>
		</main>
	))
