import {
	createComponent,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	onSettled,
	untrack,
	useContext,
	type Accessor,
} from "solid-js"
import { isServer, type JSX } from "@solidjs/web"
import { post, subscribe } from "../../../client/sync/index.ts"
import { useRouter, type Dir, type DirectionConfig } from "../../../shared/router/index.ts"
import { dirOf } from "./script-of.ts"

export type DirectionState = {
	direction: Accessor<Dir>
	setDirection: (next?: Dir) => void
}

const DirectionContext = createContext<DirectionState | null>(null)

// The subtree, and the state useDirection reads. With no direction config the children still render, and
// useDirection throws.
export function DirectionProvider(props: { locale?: string | undefined; children: JSX.Element }): JSX.Element {
	const config = useRouter().direction
	return createComponent(DirectionContext, {
		value: config === undefined ? null : directionState(config, () => props.locale),
		get children() {
			return props.children
		},
	})
}

export function useDirection(): DirectionState {
	const state = useContext(DirectionContext)
	if (state === null) throw new Error("useDirection outside DirectionProvider")
	return state
}

// The server render and the hydration render use the locale's dir and call no setter (B90). After the commit, a
// stored ltr or rtl and the channel write from client callbacks. The before-paint script owns the attribute until then.
function directionState(config: DirectionConfig, locale: () => string | undefined): DirectionState {
	const fromLocale = createMemo(() => dirOf(locale(), config.defaultDir))
	const [override, setOverride] = createSignal<Dir | undefined>(undefined)
	const direction = createMemo(() => override() ?? fromLocale())
	// Set once the stored value is read. Before that the script's attribute stands.
	let live = false
	createEffect(direction, (dir) => {
		if (live) paint(config, dir)
	})
	// Applies an override, or its removal, at once: a signal read before the flush still holds the previous value.
	const show = (next: Dir | undefined): void => {
		setOverride(next)
		paint(config, next ?? dirOf(untrack(locale), config.defaultDir))
	}
	onSettled(() => {
		const stored = readStored(config)
		if (stored !== undefined) setOverride(stored)
		live = true
		return subscribe((data) => {
			const message = directionMessage(data)
			if (message !== undefined) show(message.value ?? undefined)
		})
	})
	const setDirection = (next?: Dir): void => {
		if (isServer) throw new Error("setDirection on the server")
		if (next !== undefined && next !== "ltr" && next !== "rtl") throw new Error(`setDirection ${String(next)}`)
		write(config, next)
		show(next)
		post({ type: "direction", value: next ?? null })
	}
	return { direction, setDirection }
}

function readStored(config: DirectionConfig): Dir | undefined {
	try {
		const value = localStorage.getItem(config.storageKey)
		return value === "ltr" || value === "rtl" ? value : undefined
	} catch {
		return undefined
	}
}

// `setDirection()` removes the key. A storage failure leaves the attribute to update anyway (dx/features.md).
function write(config: DirectionConfig, next: Dir | undefined): void {
	try {
		if (next === undefined) localStorage.removeItem(config.storageKey)
		else localStorage.setItem(config.storageKey, next)
	} catch {
		// Ignored, as above.
	}
}

// `{ type: "direction", value }` with exactly those keys, the value ltr, rtl, or null (dx/features.md Cross-tab).
function directionMessage(data: unknown): { value: Dir | null } | undefined {
	if (typeof data !== "object" || data === null) return undefined
	if (Object.keys(data).length !== 2 || !("type" in data) || data.type !== "direction") return undefined
	if (!("value" in data)) return undefined
	const value = data.value
	return value === "ltr" || value === "rtl" || value === null ? { value } : undefined
}

// `dir` always, and the config's data-* attribute too.
function paint(config: DirectionConfig, dir: Dir): void {
	const root = document.documentElement
	root.setAttribute("dir", dir)
	if (config.attribute !== "dir") root.setAttribute(config.attribute, dir)
}
