import { Link, useNavigate } from "@lovrozagar/flare"
import { createSignal } from "solid-js"
import type { JSX } from "@solidjs/web"
import { useUi } from "../i18n.ts"
import { useLocaleParam } from "../locale-param.ts"
import { Controls } from "./controls.tsx"

const nav =
	"rounded-md px-2.5 py-1.5 text-sm text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
const active = "bg-stone-200/70 text-stone-900 dark:bg-ink-800 dark:text-white"

// The main nav. Each link carries the locale param and marks the active page. Docs prefetches on intent.
function MainNav(props: { locale: string | undefined }): JSX.Element {
	const ui = useUi()
	return (
		<nav class="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1" aria-label="Main">
			<Link
				to="[[locale]]/_root_/(guide)/docs/[slug]"
				params={{ locale: props.locale, slug: "routing" }}
				class={nav}
				activeClass={active}
				isActive={(location) => location.pathname.includes("/docs/")}
				prefetch="intent"
			>
				{ui("docs")}
			</Link>
			<Link
				to="[[locale]]/_root_/(guide)/api/[...path]"
				params={{ locale: props.locale, path: ["server", "create-server"] }}
				class={nav}
				activeClass={active}
				isActive={(location) => location.pathname.includes("/api/")}
			>
				{ui("api")}
			</Link>
			<Link
				to="[[locale]]/_root_/(guide)/examples/[[...rest]]"
				params={{ locale: props.locale, rest: undefined }}
				class={nav}
				activeClass={active}
			>
				{ui("examples")}
			</Link>
			<Link to="[[locale]]/_root_/changelog" params={{ locale: props.locale }} class={nav} activeClass={active}>
				{ui("changelog")}
			</Link>
			<Link to="[[locale]]/_root_/playground" params={{ locale: props.locale }} class={nav} activeClass={active}>
				{ui("playground")}
			</Link>
		</nav>
	)
}

// The site header: home, the main nav, search, and the feature controls.
export function Header(): JSX.Element {
	const ui = useUi()
	const locale = useLocaleParam()
	const navigate = useNavigate()
	const [query, setQuery] = createSignal("")
	const submit = (event: SubmitEvent): void => {
		event.preventDefault()
		void navigate({ to: "[[locale]]/_root_/search", params: { locale: locale() }, search: { q: query() } })
	}
	return (
		<header
			id="nav"
			class="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/85 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85"
		>
			<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
				<Link to="[[locale]]/_root_/" params={{ locale: locale() }} class="flex items-center gap-2 font-semibold">
					<img src="/icon.svg" alt="" width="24" height="24" />
					<span>Flare</span>
				</Link>
				<MainNav locale={locale()} />
				<form class="ms-auto" role="search" onSubmit={submit}>
					<input
						id="search-input"
						name="q"
						type="search"
						placeholder={`${ui("search")}…`}
						value={query()}
						onInput={(event) => setQuery(event.currentTarget.value)}
						class="w-44 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-flame-500 dark:border-ink-800 dark:bg-ink-900"
					/>
				</form>
				<Controls />
			</div>
		</header>
	)
}
