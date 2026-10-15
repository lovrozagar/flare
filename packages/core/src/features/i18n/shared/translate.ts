import type { JSX } from "@solidjs/web"
import { branchNodes, formatMessage, parseMessage, type Values } from "./format.ts"
import { richText, type RichComponents } from "./rich.ts"

export type Messages = Readonly<Record<string, string>>
export type Translations = Readonly<Record<string, Messages>>

// `t(key, values?)` and `t.rich(key, components, values?)`, bound to one tag's messages.
export type Translate = ((key: string, values?: Values) => string) & {
	rich: (key: string, components: RichComponents, values?: Values) => JSX.Element
}

// A null-prototype map of tag to a null-prototype map of messages, so no key reaches Object.prototype. A branch
// message without `other` is refused here, where the app sees it at startup (dx/features.md i18n).
export function createTranslations(maps: Readonly<Record<string, Readonly<Record<string, string>>>>): Translations {
	const translations: Record<string, Messages> = Object.create(null)
	for (const [tag, messages] of Object.entries(maps)) {
		const copy: Record<string, string> = Object.create(null)
		for (const [key, message] of Object.entries(messages)) {
			if (branchNodes(parseMessage(message)).some((node) => !node.branches.has("other")))
				throw new Error(`${tag}.${key}: other`)
			copy[key] = message
		}
		translations[tag] = copy
	}
	return translations
}

// The message for a key, or the key when this map does not hold it.
export function lookup(messages: Messages | undefined, key: string): string {
	return messages !== undefined && Object.hasOwn(messages, key) ? String(messages[key]) : key
}

export function translator(messages: Messages | undefined, tag: string): Translate {
	const t = (key: string, values?: Values): string => formatMessage(lookup(messages, key), values, tag)
	return Object.assign(t, {
		rich: (key: string, components: RichComponents, values?: Values) =>
			richText(lookup(messages, key), components, { values: values ?? {}, tag }),
	})
}
