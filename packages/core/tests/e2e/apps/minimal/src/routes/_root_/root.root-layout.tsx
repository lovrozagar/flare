import { createRootLayout } from "@lovrozagar/flare";

export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<title>Minimal</title>
		</head>
		<body>{props.children}</body>
	</html>
));
