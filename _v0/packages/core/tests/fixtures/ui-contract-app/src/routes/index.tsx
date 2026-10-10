import { createPage } from "@lovrozagar/flare/page";
import { cn } from "@lovrozagar/flare/styles";
import { createSignal } from "solid-js";

/* Not compiled: literals living outside a class= expression (cva-style config objects). */
const variants = { ghost: "mt-7" } as const;

function Variant(props: { v: keyof typeof variants }) {
	return <span class={variants[props.v]} data-testid="const-map" />;
}

/* Not compiled: literals inside a class function. */
function Stateful(props: { class: (state: number) => string }) {
	return <span class={props.class(1)} data-testid="class-fn" />;
}

/* One element per token: a static class string is merged at compile time, so conflicting
   utilities on one element would collapse to the last one. */
export const route = createPage("_root_/").render(() => {
	const [on] = createSignal(true);
	return (
		<main class="bg-canvas">
			<p class="text-fg" />
			<p class="border border-line" />
			<p class="ms-2" />
			<p class="bg-surface/80" />
			<p class="rtl:-scale-x-100" />
			<p class="scheme-dark" />
			<p class="data-[popup-open]:bg-surface" />
			<p class="aria-pressed:bg-canvas" />
			<p class="bg-blue-500" />
			<p class="text-surface" />
			<p class="rounded-control rounded-lg" data-testid="static-merge" />
			<p class="fixture-contract" />
			<p class="shadow-raised ring-1" data-testid="shadow-ring" />
			<div class="-space-x-2" />
			<div class="divide-y" />
			<ul class="*:p-2" />
			<div class="*:data-[slot=avatar]:ring-2" />
			<div class={cn("p-4", on() && "gap-3", on() ? "px-5" : "py-6")} data-testid="cn-arms" />
			<Variant v="ghost" />
			<Stateful class={(state) => (state > 0 ? "mb-9" : "mb-9")} />
		</main>
	);
});
