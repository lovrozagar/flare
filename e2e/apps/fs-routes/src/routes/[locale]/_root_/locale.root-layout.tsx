import { createRootLayout } from "flare/root-layout"
import { ThemeScript } from "flare/theme"

export const route = createRootLayout("[locale]/_root_")
	.head(() => ({ title: "FS locale" }))
	.render((props) => (
		<html lang="en">
			<head>
				<ThemeScript />
			</head>
			<body data-testid="locale-root">{props.children}</body>
		</html>
	))
