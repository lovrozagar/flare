import { createPage } from "@lovrozagar/flare";

// An old URL. A `.response()` page answers with its own permanent redirect to the new home of this content.
export const route = createPage("[[locale]]/_root_/legacy").response(
	({ params }) =>
		new Response(null, {
			status: 301,
			headers: { location: `${params.locale === undefined ? "" : `/${params.locale}`}/docs/routing#params` },
		}),
);
