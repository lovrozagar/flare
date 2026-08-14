import { createPage } from "flare/page"
import { createTranslator } from "flare/i18n"
import { translations } from "../../../translations"

export const route = createPage("_root_/(i18n-test)/i18n-test/[[locale]]/")
	.loader(async (ctx) => {
		const locale = ctx.location.params.locale ?? "en"
		const t = await translations.load(locale, ["common"])
		return { locale, t }
	})
	.head((ctx) => ({ title: `i18n: ${ctx.loaderData.locale}` }))
	.render((props) => {
		const t = createTranslator(props.loaderData.t, props.loaderData.locale)
		return (
			<main data-testid="i18n-page">
				<h1 data-testid="app-name">{t("common.app.name")}</h1>
				<p data-testid="greeting">{t("common.greeting", { name: "Flare" })}</p>
				<p data-testid="items-zero">{t("common.items", { count: 0 })}</p>
				<p data-testid="items-one">{t("common.items", { count: 1 })}</p>
				<p data-testid="items-many">{t("common.items", { count: 5 })}</p>
				<p data-testid="locale-value">{props.loaderData.locale}</p>
				<p data-testid="missing-key">{t("common.nonexistent" as "common.app.name")}</p>
			</main>
		)
	})
