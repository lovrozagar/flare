// The dx/types.md `app` rows for loader data, the preloader context, auth, head, defer, and effects. See checks.ts.
import { createLayout, createPage, createRootLayout, useLoaderData, usePreloaderContext } from "@lovrozagar/flare"

// loader deep
{
	const name: string = useLoaderData({ from: "_root_/users/[id]" }).user.name
	void name
	// @ts-expect-error age is not on the loader data
	void useLoaderData({ from: "_root_/users/[id]" }).user.age
	// @ts-expect-error neither is a top-level field
	void useLoaderData({ from: "_root_/users/[id]" }).missing
}

// loader primitive
{
	void createPage("_root_/static").loader(() => ({ n: 1 }))
	void createPage("_root_/static").loader(() => undefined)
	// @ts-expect-error a loader returns an object
	void createPage("_root_/static").loader(() => "text")
}

// loader awaited
{
	const data: { user: { name: string } } = useLoaderData({ from: "_root_/users/[id]" })
	void data
	// @ts-expect-error the promise is unwrapped
	const _promise: Promise<{ user: { name: string } }> = useLoaderData({ from: "_root_/users/[id]" })
}

// loader absent
{
	const data: void = useLoaderData({ from: "_root_/static" })
	void data
	// @ts-expect-error there is no field without a loader
	void useLoaderData({ from: "_root_/static" }).title
}

// parent loader hidden
{
	const title: string = useLoaderData({ from: "_root_/(blog)/post/[slug]" }).title
	void title
	// @ts-expect-error the layout's field is a second call with its own id
	void useLoaderData({ from: "_root_/(blog)/post/[slug]" }).section
}

// layout data
{
	const section: string = useLoaderData({ from: "_root_/(blog)" }).section
	void section
	// @ts-expect-error the page's field is not on the layout
	void useLoaderData({ from: "_root_/(blog)" }).title
}

// preloader accumulate
{
	const context = usePreloaderContext({ from: "_root_/(blog)/post/[slug]" })
	const requestId: string = context.requestId
	void [requestId, context.role]
	// @ts-expect-error a parent key is not erased
	const _missing: typeof context = { role: "admin" }
}

// preloader narrow
{
	const role: "admin" = usePreloaderContext({ from: "_root_/(blog)/post/[slug]" }).role
	void role
	// @ts-expect-error the wider parent member does not survive
	const _editor: typeof role = "editor"
}

// root preloader
{
	void createRootLayout("_root_")
		.preloader((ctx) => {
			// @ts-expect-error the root preloader has no parents
			void ctx.preloaderContext
			return { requestId: "r" }
		})
		.loader((ctx) => {
			const requestId: string = ctx.preloaderContext.requestId
			// @ts-expect-error a root has no parent key
			void ctx.preloaderContext.role
			return { requestId }
		})
}

// auth required
{
	void createLayout("_root_/(blog)")
		.authenticate()
		.loader((ctx) => {
			const userId: string = ctx.auth.userId
			// @ts-expect-error a required session is never null
			const _null: typeof ctx.auth = null
			return { userId }
		})
}

// auth optional
{
	void createPage("_root_/guest")
		.authenticateOptional()
		.loader((ctx) => {
			const name: string | undefined = ctx.auth?.userId
			// @ts-expect-error the session may be null
			void ctx.auth.userId
			return { name }
		})
}

// cannot loosen
{
	void createPage("_root_/(blog)/post/[slug]").authenticate()
	// @ts-expect-error a required parent cannot loosen to optional
	void createPage("_root_/(blog)/post/[slug]").authenticateOptional()
}

// omit keeps parent
{
	void createPage("_root_/(blog)/post/[slug]").loader((ctx) => {
		const userId: string = ctx.auth.userId
		// @ts-expect-error the parent's required session stays
		const _null: typeof ctx.auth = null
		return { userId }
	})
}

// grandchild strict
{
	void createPage("_root_/(blog)/post/[slug]/comments").loader((ctx) => {
		const userId: string = ctx.auth.userId
		// @ts-expect-error the middle file's omission does not widen the grandchild
		const _null: typeof ctx.auth = null
		return { userId }
	})
}

// authorize reads
{
	void createPage("_root_/public")
		.authorize((ctx) => ctx.auth !== null)
		.loader((ctx) => {
			const userId: string | undefined = ctx.auth?.userId
			// @ts-expect-error the session is not null only
			const _null: null = ctx.auth
			// @ts-expect-error a public authorize still needs a null check
			void ctx.auth.userId
			return { userId }
		})
}

// render auth
{
	void createPage("_root_/(blog)/post/[slug]")
		.authenticate()
		.render((props) => {
			// @ts-expect-error render has no auth
			void props.auth
			return null
		})
}

// defer field
{
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	void reviews.key
	// @ts-expect-error the field is the Deferred, not its value
	const _value: { quote: string } = reviews
	async function awaited(): Promise<void> {
		// @ts-expect-error a Deferred has no then, so awaiting it is not the value
		const _quote: { quote: string } = await reviews
	}
	void awaited
}

// defer nested
{
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	async function read(): Promise<string> {
		return (await reviews.promise).quote
	}
	void read
	// @ts-expect-error the value is on .promise
	void reviews.quote
}

// head loader
{
	void createPage("_root_/users/[id]")
		.loader(async () => ({ user: { name: "n" } }))
		.head((ctx) => {
			const title: string = `${ctx.loaderData.user.name} ${ctx.preloaderContext.requestId} ${ctx.params.id}`
			// @ts-expect-error head has no auth
			void ctx.auth
			// @ts-expect-error a parent loader's field is not on this route's data
			void ctx.loaderData.section
			// @ts-expect-error there is no parentHead
			void ctx.parentHead
			return { title }
		})
}

// loader deps raw
{
	void createPage("_root_/search").effects({
		loaderDeps: (ctx) => {
			const page: string | string[] | undefined = ctx.search["page"]
			// @ts-expect-error loaderDeps reads the raw search, not the validator output
			const _number: number | undefined = ctx.search["page"]
			return [page]
		},
	})
}
