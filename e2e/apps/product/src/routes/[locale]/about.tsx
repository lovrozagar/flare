import { createTranslator } from "flare/i18n"
import { Link } from "flare/link"
import { createPage } from "flare/page"
import { translations } from "../../translations"

export const route = createPage("_root_/[locale]/about")
	.loader(async (ctx) => {
		const locale = ctx.location.params.locale || ctx.locale() || "en"
		const t = await translations.load(locale, ["common"])
		return { locale, t }
	})
	.head((ctx) => ({ title: `About (${ctx.loaderData.locale})` }))
	.render((props) => {
		const t = createTranslator(props.loaderData.t, props.loaderData.locale)
		return (
			<main data-testid="locale-about">
				<h1 data-testid="locale-about-heading">About</h1>
				<p data-testid="locale-about-welcome">{t("common.welcome")}</p>
				<p data-testid="locale-about-locale">{props.loaderData.locale}</p>
				<nav>
					<Link
						data-testid="locale-about-home"
						params={{ locale: props.loaderData.locale }}
						to="/[locale]"
					>
						Home
					</Link>
				</nav>
			</main>
		)
	})
