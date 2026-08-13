import { createPage } from "flare/page"
import { createPathSegment } from "flare/path-segment"

export const orgSegment = createPathSegment("_root_/(path-seg-deep)/path-seg-deep/[org]").cache({
	ssg: {
		params: () => [{ org: "acme" }, { org: "globex" }],
	},
})

export const repoSegment = createPathSegment(
	"_root_/(path-seg-deep)/path-seg-deep/[org]/[repo]",
).cache({
	ssg: {
		params: (ctx) => {
			const org = ctx.params.org as string
			if (org === "acme") return [{ repo: "api" }, { repo: "web" }]
			return [{ repo: "main" }]
		},
	},
})

export const route = createPage("_root_/(path-seg-deep)/path-seg-deep/[org]/[repo]/settings")
	.cache({ ssg: true })
	.loader((ctx) => ({
		org: ctx.location.params.org,
		repo: ctx.location.params.repo,
	}))
	.render((props) => (
		<div data-testid="path-seg-deep">
			<h1>Settings</h1>
			<p data-testid="path-seg-org">{props.loaderData.org}</p>
			<p data-testid="path-seg-repo">{props.loaderData.repo}</p>
		</div>
	))
