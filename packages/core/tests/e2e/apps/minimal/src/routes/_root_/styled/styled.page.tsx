import { createPage } from "@lovrozagar/flare";

// A multi-key style object, which the Solid compiler turns into a runtime call on the server and the client.
export const route = createPage("_root_/styled").render(() => (
	<p id="styled" style={{ color: "rgb(255, 0, 0)", "font-weight": "700" }}>
		styled
	</p>
));
