import { DirectionProvider, DirectionScript } from "@lovrozagar/flare/direction";
import { LocaleProvider, LocaleScript } from "@lovrozagar/flare/locale";
import { createRootLayout } from "@lovrozagar/flare/root-layout";
import { ThemeProvider, ThemeScript } from "@lovrozagar/flare/theme";
import { ViewTransitionCSS } from "@lovrozagar/flare/view-transition-css";
import { localeConfig } from "../router";

export const route = createRootLayout("_root_")
	.preloader((ctx) => ({ locale: ctx.locale() }))
	.head(() => ({
		meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
		title: "Flare E2E",
	}))
	.render((props) => (
		<html lang={props.preloaderContext.locale || "en"}>
			<head>
				<ViewTransitionCSS />
				<ThemeScript />
				<DirectionScript />
				<LocaleScript config={localeConfig} />
			</head>
			<body>
				<a class="skip-link" data-testid="skip-link" href="#main-content">
					Skip to main content
				</a>
				<ThemeProvider>
					<DirectionProvider>
						<LocaleProvider config={localeConfig} initial={props.preloaderContext.locale}>
							{props.children}
						</LocaleProvider>
					</DirectionProvider>
				</ThemeProvider>
			</body>
		</html>
	))
	.errorRender((props) => (
		<div data-testid="root-error-boundary">
			<h1>Something went wrong</h1>
			<p data-testid="root-error-message">{props.error.message}</p>
		</div>
	))
	.notFoundRender(() => (
		<div data-testid="not-found-boundary">
			<h1 data-testid="not-found-heading">404 — Page Not Found</h1>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
	.unauthenticatedRender(() => (
		<div data-testid="root-unauthenticated">
			<h1>Please log in</h1>
		</div>
	))
	.unauthorizedRender(() => (
		<div data-testid="root-unauthorized">
			<h1>Forbidden</h1>
		</div>
	));
