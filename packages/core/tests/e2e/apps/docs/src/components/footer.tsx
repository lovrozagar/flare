import { formatMessage } from "@lovrozagar/flare/i18n";
import { createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { renderedOn } from "../runtime.ts";
import { Lifecycle } from "./lifecycle.tsx";

// The request that rendered this document, the runtime that served it, and where the badge last rendered. The badge
// starts as the server's answer so hydration matches, then the client side of the isomorphic function takes over.
export function Footer(props: { requestId: string; runtime: string; version: string }): JSX.Element {
	const [where, setWhere] = createSignal("server");
	onSettled(() => {
		setWhere(renderedOn());
	});
	return (
		<footer class="mt-24 border-t border-stone-200 dark:border-ink-800">
			<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-xs text-stone-500">
				<span>
					Flare <span id="version">{props.version}</span>
				</span>
				<span>
					request <code id="request-id">{props.requestId}</code>
				</span>
				<span>
					runtime <code id="runtime">{props.runtime}</code>
				</span>
				<span>
					rendered on <code id="rendered-on">{where()}</code>
				</span>
				{/* The provider's tag picks the plural category: Arabic's for 14 is `many`, English's `other` (BUGS.md B29). */}
				<span id="release-count">
					{formatMessage("{n, plural, one {# release} many {# releases (many)} other {# releases}}", { n: 14 })}
				</span>
				<Lifecycle />
			</div>
		</footer>
	);
}
