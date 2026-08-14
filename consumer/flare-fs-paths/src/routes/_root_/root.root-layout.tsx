import { createRootLayout } from "flare/root-layout"
import { ThemeScript } from "flare/theme"

export const route = createRootLayout("_root_")
	.head(() => ({ title: "FS paths" }))
	.render((props) => (
		<html lang="en">
			<head>
				<ThemeScript />
				<link as="document" href="/about" rel="prefetch" />
				<link as="document" href="/blog" rel="prefetch" />
				<link as="document" href="/login" rel="prefetch" />
				<link as="document" href="/dashboard" rel="prefetch" />
			</head>
			<body>{props.children}</body>
		</html>
	))
