import { createTranslator } from "flare/i18n"
import { Link } from "flare/link"
import { createPage } from "flare/page"
import { translations } from "../translations"

export const route = createPage("_root_/i18n-demo/[[locale]]/")
	.loader(async (ctx) => {
		const fromParam = ctx.location.params.locale
		const locale =
			(typeof fromParam === "string" && fromParam) || ctx.locale() || "en"
		const t = await translations.load(locale, ["common"])
		return { locale, t }
	})
	.head((ctx) => ({ title: `i18n: ${ctx.loaderData.locale}` }))
	.render((props) => {
		const t = createTranslator(props.loaderData.t, props.loaderData.locale)
		return (
			<main data-testid="i18n-page">
				<h1 data-testid="welcome-title">{t("common.welcome")}</h1>
				<p data-testid="welcome-greeting">{t("common.greeting", { name: "Flare" })}</p>
				<p data-testid="welcome-items">{t("common.items", { count: 3 })}</p>
				<p data-testid="locale-value">{props.loaderData.locale}</p>
				<nav>
					<Link data-testid="switch-en" href="/i18n-demo">
						EN
					</Link>
					<Link data-testid="switch-hr" href="/i18n-demo/hr">
						HR
					</Link>
					<Link data-testid="switch-fr" href="/i18n-demo/fr">
						FR
					</Link>
				</nav>
			</main>
		)
	})
