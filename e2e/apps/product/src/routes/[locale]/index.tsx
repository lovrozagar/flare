import { createTranslator } from "flare/i18n"
import { Link } from "flare/link"
import { createPage } from "flare/page"
import { translations } from "../../translations"

export const route = createPage("_root_/[locale]/")
	.loader(async (ctx) => {
		const locale = ctx.location.params.locale || ctx.locale() || "en"
		const t = await translations.load(locale, ["common"])
		return { locale, t }
	})
	.head((ctx) => ({ title: `Home (${ctx.loaderData.locale})` }))
	.render((props) => {
		const t = createTranslator(props.loaderData.t, props.loaderData.locale)
		return (
			<main data-testid="locale-home">
				<h1 data-testid="locale-home-welcome">{t("common.welcome")}</h1>
				<p data-testid="locale-home-locale">{props.loaderData.locale}</p>
				<nav>
					<Link
						data-testid="locale-home-about"
						params={{ locale: props.loaderData.locale }}
						to="/[locale]/about"
					>
						About
					</Link>
				</nav>
			</main>
		)
	})
