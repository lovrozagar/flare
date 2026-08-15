import { FontCSS } from "@lovrozagar/flare/fonts";
import { inter } from "@lovrozagar/flare/fonts/inter";
import { LocaleProvider, LocaleScript } from "@lovrozagar/flare/locale";
import { ResetCSS } from "@lovrozagar/flare/reset-css";
import { createRootLayout } from "@lovrozagar/flare/root-layout";
import { ViewTransitionCSS } from "@lovrozagar/flare/view-transition-css";
import { localeConfig } from "../../../i18n/config";

export const rootLayout = createRootLayout("[[locale]]/_root_")
	.preloader((ctx) => ({ locale: ctx.location.params.locale ?? "en" }))
	.render((ctx) => (
		<html lang={ctx.preloaderContext.locale} class="bg-black text-white">
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
	));
