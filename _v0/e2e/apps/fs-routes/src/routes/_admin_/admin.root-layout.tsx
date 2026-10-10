import { createRootLayout } from "@lovrozagar/flare/root-layout";
import { ThemeScript } from "@lovrozagar/flare/theme";

export const route = createRootLayout("_admin_").render((props) => (
	<html lang="en">
		<head>
			<ThemeScript />
		</head>
		<body data-testid="admin-root">{props.children}</body>
	</html>
));
