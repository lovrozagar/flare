import { createPage } from "@lovrozagar/flare";

// Prerendered at build. A production server reads its seed through the static store (static.test).
export const route = createPage("_root_/static")
	.cache({ ssg: true })
	.render(() => <p id="static">static page</p>);
