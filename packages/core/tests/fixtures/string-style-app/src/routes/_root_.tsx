import { createRootLayout } from "@lovrozagar/flare/root-layout";

export const route = createRootLayout("_root_")
	.head(() => ({
		meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
		title: "Flare on Standard",
	}))
	.render((props) => (
		<html lang="en">
			<head />
			<body>{props.children}</body>
		</html>
	))
	.notFoundRender(() => (
		<div data-testid="not-found-boundary">
			<h1 data-testid="not-found-heading">404 — Page Not Found</h1>
			<p data-testid="not-found-platform">Standard</p>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	));
