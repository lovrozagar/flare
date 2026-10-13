import { DirectionProvider, DirectionScript, createRootLayout, ThemeProvider, ThemeScript } from "@lovrozagar/flare";
import { LocaleProvider, LocaleScript } from "@lovrozagar/flare/i18n";
import { localeConfig } from "../../../router.ts";

// The optional `[[locale]]` param is the tag: `initial` for the locale and `locale` for the direction. The default
// tag has no segment. The three scripts run before paint, under the request nonce.
export const route = createRootLayout("[[locale]]/_root_").render((props) => (
	<LocaleProvider config={localeConfig} initial={props.params.locale}>
		<html>
			<head>
				<title>i18n</title>
				<ThemeScript />
				<DirectionScript locale={props.params.locale} />
				<LocaleScript />
			</head>
			<body>
				<ThemeProvider>
					<DirectionProvider locale={props.params.locale}>
						<div id="app">{props.children}</div>
					</DirectionProvider>
				</ThemeProvider>
			</body>
		</html>
	</LocaleProvider>
));
