import { createRootLayout } from "@lovrozagar/flare/root-layout";

export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head />
		<body>{props.children}</body>
	</html>
));
