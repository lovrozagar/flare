import { createLayout } from "flare/layout"
import { Link } from "flare/link"
import { translations } from "../../../../i18n/translations"

export const route = createLayout("[[locale]]/_root_/(main)")
	.loader(async (ctx) => {
		const t = await translations.load(ctx.locale(), ["common"])
		return { t }
	})
	.render((ctx) => {
		const t = ctx.router.useLoaderT({ from: "[[locale]]/_root_/(main)" })
		const locale = ctx.router.locale() ?? "en"

		return (
			<>
				<nav data-testid="main-nav" class="flex items-center gap-4 p-4 border-b border-white/10">
					<Link
						data-testid="nav-home"
						params={{ locale: locale === "en" ? undefined : locale }}
						to="/[[locale]]"
					>
						{t("common.nav.home")}
					</Link>
					<Link
						data-testid="nav-about"
						params={{ locale: locale === "en" ? undefined : locale }}
						to="/[[locale]]/about"
					>
						{t("common.nav.about")}
					</Link>
					<div data-testid="locale-switcher" class="ml-auto flex gap-2 text-sm">
						<Link data-testid="switch-en" params={{ locale: undefined }} to="/[[locale]]">
							en
						</Link>
						<Link data-testid="switch-hr" params={{ locale: "hr" }} to="/[[locale]]">
							hr
						</Link>
						<Link data-testid="switch-fr" params={{ locale: "fr" }} to="/[[locale]]">
							fr
						</Link>
					</div>
				</nav>
				<div class="p-4">{ctx.children}</div>
			</>
		)
	})
