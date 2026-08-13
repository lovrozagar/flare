import { createRootLayout } from "flare"

export const route = createRootLayout("_root_")
	.head(() => ({
		meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
		title: "Flare Benchmark",
	}))
	.render((props) => (
		<html lang="en">
			<head />
			<body>
				<nav>
					<a href="/">Home</a>
					{" | "}
					<a href="/about">About</a>
				</nav>
				<div id="app">{props.children}</div>
			</body>
		</html>
	))
	.errorRender((props) => (
		<div>
			<h1>Error</h1>
			<p>{props.error.message}</p>
		</div>
	))
	.notFoundRender(() => (
		<div>
			<h1>404</h1>
			<p>Page not found</p>
		</div>
	))
