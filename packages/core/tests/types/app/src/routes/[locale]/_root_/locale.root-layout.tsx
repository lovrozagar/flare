import { createRootLayout } from "@lovrozagar/flare";

export const route = createRootLayout("[locale]/_root_").render((props) => (
	<html lang={props.params.locale}>
		<body>{props.children}</body>
	</html>
));
