import { createRootLayout } from "flare/root-layout"
import { ThemeScript } from "flare/theme"

export const route = createRootLayout("_root_")
	.head(() => ({
		meta: { viewport: "width=device-width, initial-scale=1" },
		title: "FS paths",
	}))
	.render((props) => (
		<html lang="en">
			<head>
				<ThemeScript />
			</head>
			<body>{props.children}</body>
		</html>
	))
