import { redirect } from "@lovrozagar/flare/errors";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/redirect-with-params")
	.loader(({ location }) => {
		const search: Record<string, string> = {};
		for (const [key, value] of new URL(location.url.href).searchParams) {
			search[key] = value;
		}
		throw redirect({ search, status: 302, to: "/redirect-target" });
	})
	.render(() => <div>no</div>);
