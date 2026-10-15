import { useDirection, useTheme } from "@lovrozagar/flare"
import { useLocale } from "@lovrozagar/flare/i18n"
import { For } from "solid-js"
import type { JSX } from "@solidjs/web"

const pill =
	"rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-ink-800"

function Group(props: { label: string; status: JSX.Element; children: JSX.Element }): JSX.Element {
	return (
		<div class="flex items-center gap-1" role="group" aria-label={props.label}>
			{props.children}
			<span class="ms-1 rounded bg-stone-200 px-1.5 py-0.5 font-mono text-[10px] text-stone-600 dark:bg-ink-800 dark:text-stone-400">
				{props.status}
			</span>
		</div>
	)
}

// One control per feature, and the value each hook reports beside it. Every choice persists and syncs to other tabs.
export function Controls(): JSX.Element {
	const theme = useTheme()
	const direction = useDirection()
	const locale = useLocale()
	return (
		<div class="flex flex-wrap items-center gap-3">
			<Group label="Theme" status={<span id="theme">{theme.theme()}</span>}>
				<For each={["light", "dark", "system"] as const}>
					{(name) => (
						<button id={name} type="button" class={pill} onClick={() => theme.setTheme(name)}>
							{name}
						</button>
					)}
				</For>
			</Group>
			<Group label="Direction" status={<span id="dir">{direction.direction()}</span>}>
				<button id="ltr" type="button" class={pill} onClick={() => direction.setDirection("ltr")}>
					ltr
				</button>
				<button id="rtl" type="button" class={pill} onClick={() => direction.setDirection("rtl")}>
					rtl
				</button>
				<button id="dir-auto" type="button" class={pill} onClick={() => direction.setDirection()}>
					auto
				</button>
			</Group>
			<Group label="Language" status={<span id="locale">{locale.locale()}</span>}>
				<For each={locale.locales}>
					{(tag) => (
						<button id={tag} type="button" class={pill} onClick={() => locale.setLocale(tag)}>
							{tag}
						</button>
					)}
				</For>
			</Group>
		</div>
	)
}
