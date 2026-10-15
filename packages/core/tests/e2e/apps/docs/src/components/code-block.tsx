import { createClientOnlyFn } from "@lovrozagar/flare"
import { createSignal } from "solid-js"
import type { JSX } from "@solidjs/web"
import styles from "./code-block.module.css"

// The body runs only in the browser. The server chunk does not contain it.
const copyText = createClientOnlyFn(async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
})

export function CodeBlock(props: { code: string }): JSX.Element {
	const [copied, setCopied] = createSignal("")
	const copy = async (): Promise<void> => {
		const ok = await copyText(props.code)
		setCopied(ok ? "copied" : "select and copy")
	}
	return (
		<div class="relative">
			<pre class={styles["block"]} data-code-block="">
				<code>{props.code}</code>
			</pre>
			<button type="button" class={styles["copy"]} data-copy="" onClick={() => void copy()}>
				{copied() || "copy"}
			</button>
		</div>
	)
}
