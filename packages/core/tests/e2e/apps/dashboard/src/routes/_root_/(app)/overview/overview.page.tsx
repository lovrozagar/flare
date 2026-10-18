import { createPage, Link, markSafeError, useDeferred, type Deferred } from "@lovrozagar/flare"
import { createEffect, createSignal, Errored, For, Loading } from "solid-js"
import type { JSX } from "@solidjs/web"
import { workspaceOf } from "../../../../db.ts"
import { activityFeed } from "../../../../fns/activity.ts"

function after<T>(ms: number, value: () => T): Promise<T> {
	return new Promise((resolve, reject) =>
		setTimeout(() => {
			try {
				resolve(value())
			} catch (error) {
				reject(error)
			}
		}, ms),
	)
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

// One widget: a skeleton while its value is pending, then the value.
function Widget(props: { id: string; label: string; read: () => Deferred<string> }): JSX.Element {
	const value = useDeferred(props.read)
	return (
		<div class="rounded-xl border border-slate-200 bg-white p-4">
			<p class="text-xs uppercase tracking-wide text-slate-500">{props.label}</p>
			<Loading fallback={<p id={`${props.id}-loading`} class="mt-2 h-6 w-20 animate-pulse rounded bg-slate-100" />}>
				<p id={props.id} class="mt-2 text-xl font-semibold">
					{value()}
				</p>
			</Loading>
		</div>
	)
}

// The live feed: started by an effect once the page is on screen, and stopped when it leaves. An effect's callback,
// not onSettled, which Flare's dev check reads as a render (B36).
function Feed(): JSX.Element {
	const [events, setEvents] = createSignal<{ index: number; text: string }[]>([])
	const [stopped, setStopped] = createSignal("")
	createEffect(
		() => true,
		() => {
			const stream = activityFeed()[Symbol.asyncIterator]()
			const read = async (): Promise<void> => {
				for (let next = await stream.next(); next.done !== true; next = await stream.next()) {
					const event = next.value
					setEvents((list) => [event, ...list].slice(0, 5))
				}
			}
			read().catch((error: unknown) => setStopped(messageOf(error)))
			return () => void stream.return?.()
		},
	)
	return (
		<div>
			<ol id="feed" class="mt-2 space-y-1 text-sm">
				<For each={events()} keyed={(event) => event.index}>
					{(event) => <li>{event().text}</li>}
				</For>
			</ol>
			<p id="feed-stopped" class="text-xs text-red-700">
				{stopped()}
			</p>
		</div>
	)
}

// The overview: four widgets, each its own defer with its own latency, and a live feed. The document waits for every
// defer (B146 `documentResponseDefer: "buffer"`); a client navigation shows each widget's skeleton until it lands.
// `?incidents=fail` makes the incidents widget reject: on a client navigation the widget's own <Errored> paints it,
// and a document, which has no place for it, fails at this page (dx/defer.md, BUGS.md 370).
export const route = createPage("_root_/(app)/overview")
	.loader(({ auth, search, defer }) => {
		const workspace = workspaceOf(auth.workspaceId)
		const projects = workspace?.projects ?? []
		const failing = search["incidents"] === "fail"
		return {
			revenue: defer(() => after(40, () => `$${projects.reduce((sum, project) => sum + project.budget, 0)}`), {
				key: "revenue",
			}),
			active: defer(() => after(150, () => String(projects.filter((p) => p.status === "active").length)), {
				key: "active",
			}),
			plan: defer(() => after(300, () => workspace?.plan ?? "free"), { key: "plan" }),
			incidents: defer(
				() =>
					after(220, () => {
						if (failing) throw markSafeError(new Error("The incidents service is down"))
						return "0 open"
					}),
				{ key: "incidents" },
			),
		}
	})
	.head(() => ({ title: "Overview — Dashboard" }))
	.render((props) => (
		<section>
			<div class="flex items-center justify-between">
				<h1 id="title" class="text-lg font-semibold">
					Overview
				</h1>
				<Link
					id="outage"
					to="_root_/(app)/overview"
					search={{ incidents: "fail" }}
					class="text-xs text-slate-500 underline"
				>
					Simulate an incidents outage
				</Link>
			</div>
			<div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<Widget id="revenue" label="Budget" read={() => props.loaderData.revenue} />
				<Widget id="active" label="Active projects" read={() => props.loaderData.active} />
				<Widget id="plan" label="Plan" read={() => props.loaderData.plan} />
				<Errored
					fallback={(error, reset) => (
						<div id="incidents-error" class="rounded-xl border border-red-200 bg-white p-4 text-sm">
							<p>{messageOf(error())}</p>
							<button id="incidents-retry" type="button" class="mt-2 underline" onClick={() => reset()}>
								Retry
							</button>
						</div>
					)}
				>
					<Widget id="incidents" label="Incidents" read={() => props.loaderData.incidents} />
				</Errored>
			</div>
			<h2 class="mt-8 text-sm font-semibold text-slate-700">Activity</h2>
			<Feed />
		</section>
	))
