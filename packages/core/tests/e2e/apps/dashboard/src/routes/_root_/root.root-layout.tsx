import { createRootLayout, Stylesheet } from "@lovrozagar/flare"
import { QueryClientProvider } from "@tanstack/solid-query"
import { getQueryClient } from "../../query.ts"
import "../../styles.css"

// The one document. It reads no identity, so a public page under it stays public (B146).
export const route = createRootLayout("_root_")
	.head(() => ({ title: "Dashboard", robots: { index: false, follow: false } }))
	.render((props) => (
		<html lang="en">
			<head>
				<Stylesheet />
			</head>
			<body class="min-h-screen">
				<QueryClientProvider client={getQueryClient()}>{props.children}</QueryClientProvider>
			</body>
		</html>
	))
