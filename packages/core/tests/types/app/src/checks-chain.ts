// The dx/types.md `app` rows for the route steps the other checks files do not reach: headers, security, effects,
// the boundaries, and the preloader context and session through `preloader` and `authorize`. See checks.ts.
import { createPage } from "@lovrozagar/flare"

type Raw = Record<string, string | string[]>

// The validators the route files give the same ids: a builder types params and search from its own chain.
const search = { searchParams: (raw: Raw) => ({ q: String(raw["q"] ?? "") }) }
const shaped = { params: (raw: Raw) => ({ id: Number(raw["id"]) }) }

// headers record
{
	void createPage("_root_/users/[id]")
		.loader(async () => ({ user: { name: "n" } }))
		.headers((ctx) => {
			const id: string = ctx.params.id
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error headers has no auth
			void ctx.auth
			// @ts-expect-error there is no parentHeaders
			void ctx.parentHeaders
			return { "x-user": `${ctx.loaderData.user.name} ${id}`, "set-cookie": [requestId, "b=1"] }
		})
	void createPage("_root_/users/[id]").headers(
		// @ts-expect-error a header value is a string or a string array
		() => ({ "x-count": 1 }),
	)
}

// security no nonce
{
	void createPage("_root_/search")
		.input(search)
		.security((ctx) => {
			const q: string = ctx.search.q
			void q
			// @ts-expect-error the nonce is the request's, not the policy's input
			void ctx.nonce
			return {}
		})
}

// should refetch raw
{
	void createPage("_root_/search").effects({
		shouldRefetch: (ctx) => {
			const page: string | string[] | undefined = ctx.search["page"]
			const query: string = ctx.location.current.search
			// @ts-expect-error shouldRefetch reads the raw search, not the validator output
			const _number: number | undefined = ctx.search["page"]
			return page !== undefined && query !== ctx.location.next.search
		},
	})
}

// error boundary
{
	void createPage("_root_/shaped/[id]")
		.input(shaped)
		.render(() => null)
		.errorRender((props) => {
			const id: number = props.params.id
			const error: Error = props.error
			props.reset()
			// @ts-expect-error the error is an Error, not a string
			const _message: string = props.error
			// @ts-expect-error a boundary has no auth
			void props.auth
			return `${id} ${error.message}`
		})
}

// not found boundary
{
	void createPage("_root_/search")
		.input(search)
		.render(() => null)
		.notFoundRender((props) => {
			const q: string = props.search.q
			// @ts-expect-error not found has no error
			void props.error
			return q
		})
}

// auth boundary
{
	void createPage("_root_/shaped/[id]")
		.input(shaped)
		.render(() => null)
		.unauthenticatedRender((props) => {
			const id: number = props.params.id
			const error: Error = props.error
			// @ts-expect-error an auth boundary has no reset
			void props.reset
			return `${id} ${error.message}`
		})
}

// preloader parents only
{
	void createPage("_root_/about")
		.authorize((ctx) => {
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error the own preloader's return is not visible before it
			void ctx.preloaderContext.n
			return requestId !== ""
		})
		.preloader((ctx) => {
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error the own return is not visible to its own callback
			void ctx.preloaderContext.n
			return { n: requestId.length }
		})
}

// preloader empty keeps
{
	void createPage("_root_/about")
		.preloader(() => ({}))
		.loader((ctx) => {
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error an empty own return does not erase the parent's key
			const _empty: typeof ctx.preloaderContext = {}
			return { requestId }
		})
}

// authorize keeps required
{
	void createPage("_root_/(blog)/post/[slug]")
		.authorize((ctx) => ctx.auth.userId !== "")
		.loader((ctx) => {
			const userId: string = ctx.auth.userId
			// @ts-expect-error authorize does not widen a required parent
			const _null: typeof ctx.auth = null
			return { userId }
		})
}

// authorize keeps optional
{
	void createPage("_root_/guest")
		.authenticateOptional()
		.authorize((ctx) => ctx.auth === null || ctx.auth.userId !== "")
		.loader((ctx) => {
			const userId: string | undefined = ctx.auth?.userId
			// @ts-expect-error authorize does not make an optional session non-null
			void ctx.auth.userId
			return { userId }
		})
}
