import { createRootLayout } from "@lovrozagar/flare";

// A production root renders the whole document, or every page is a 500 (B37).
export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<title>Basepath</title>
		</head>
		<body>
			<main id="app">{props.children}</main>
		</body>
	</html>
));
