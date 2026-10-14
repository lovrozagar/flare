import { createPage, redirect } from "@lovrozagar/flare";

// An old URL. A `.response()` page throws a permanent `redirect()` to the new home of this content, typed by the doc
// page's id and params like a `Link` (BUGS.md 105).
export const route = createPage("[[locale]]/_root_/legacy").response(({ params }) =>
	redirect({
		to: "[[locale]]/_root_/(guide)/docs/[slug]",
		params: { locale: params.locale, slug: "routing" },
		hash: "params",
		status: 301,
	}),
);
