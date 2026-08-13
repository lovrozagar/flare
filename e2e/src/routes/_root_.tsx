import { createRootLayout } from "flare/root-layout"
import { DirectionScript } from "flare/direction"
import { NavigationProgress } from "flare/navigation-progress"
import { ResetCSS } from "flare/reset-css"
import { ThemeScript } from "flare/theme"
import { ViewTransitionCSS } from "flare/view-transition-css"

export const route = createRootLayout("_root_")
	.preloader(() => ({ b: 1 }))
	.head(() => ({
		meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
		title: "Flare E2E",
	}))
	.render((props) => (
		<html lang="en">
			<head>
				<ResetCSS />
				<ViewTransitionCSS />
				<ThemeScript />
				<DirectionScript />
			</head>
			<body>
				<NavigationProgress color="#3b82f6" />
				{props.children}
			</body>
		</html>
	))
	.errorRender((props) => (
		<div data-testid="root-error-boundary">
			<h1>Something went wrong</h1>
			<p>{props.error.message}</p>
		</div>
	))
	.notFoundRender(() => (
		<div data-testid="not-found-boundary">
			<h1>404</h1>
			<p>Page not found</p>
		</div>
	))
