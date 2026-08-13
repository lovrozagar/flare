import { createRootLayout } from "flare/root-layout"

export const route = createRootLayout("_root_")
	.head(() => ({
		meta: { charset: "utf-8", viewport: "width=device-width, initial-scale=1" },
		title: "Flare on Tauri",
	}))
	.render((props) => (
		<html lang="en">
			<head />
			<body style={{ "font-family": "system-ui, sans-serif", margin: 0 }}>{props.children}</body>
		</html>
	))
	.notFoundRender(() => (
		<div>
			<h1>404 — Page Not Found</h1>
			<a href="/">Home</a>
		</div>
	))
