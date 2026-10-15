import { createRootLayout } from "@lovrozagar/flare"

export const route = createRootLayout("_root_")
	.preloader(() => ({ requestId: "r" }))
	.render((props) => (
		<html lang="en">
			<body>{props.children}</body>
		</html>
	))
