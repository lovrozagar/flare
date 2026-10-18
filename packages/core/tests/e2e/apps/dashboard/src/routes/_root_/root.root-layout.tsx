import { createRootLayout, Stylesheet } from "@lovrozagar/flare"
import "../../styles.css"

// The one document. It reads no identity, so a public page under it stays public (B146).
export const route = createRootLayout("_root_")
	.head(() => ({ title: "Dashboard", robots: { index: false, follow: false } }))
	.render((props) => (
		<html lang="en">
			<head>
				<Stylesheet />
			</head>
			<body class="min-h-screen">{props.children}</body>
		</html>
	))
