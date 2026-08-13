import { FontCSS } from "flare/fonts"
import { inter } from "flare/fonts/inter"
import { LocaleProvider, LocaleScript } from "flare/locale"
import { ResetCSS } from "flare/reset-css"
import { createRootLayout } from "flare/root-layout"
import { ViewTransitionCSS } from "flare/view-transition-css"
import { localeConfig } from "../../../i18n/config"

export const rootLayout = createRootLayout("[[locale]]/_root_")
	.preloader((ctx) => ({ locale: ctx.location.params.locale ?? "en" }))
	.render((ctx) => (
		<html lang={ctx.preloaderContext.locale} tw="bg-black text-white">
			<head>
				<FontCSS font={inter} subsets={["latin", "latin-ext"]} />
				<ResetCSS />
				<ViewTransitionCSS />
				<LocaleScript config={localeConfig} />
			</head>
			<body style={{ "font-family": inter.fontFamily }}>
				<LocaleProvider config={localeConfig} initial={ctx.preloaderContext.locale}>
					{ctx.children}
				</LocaleProvider>
			</body>
		</html>
	))
