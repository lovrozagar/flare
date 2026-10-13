import { createPage, useDeferred } from "@lovrozagar/flare";
import { Loading } from "solid-js";
import {
	EchoCard,
	ErrorsCard,
	NotesCard,
	Result,
	StreamCard,
	useCalls,
} from "../../../../components/playground-cards.tsx";

// Server functions from events, the place a client call belongs. A page loader's deferred tip streams in after the
// shell, because this page is not stored.
export const route = createPage("[[locale]]/_root_/playground")
	.loader(({ defer }) => ({
		tip: defer(() => new Promise<string>((resolve) => setTimeout(() => resolve("Stop the stream halfway."), 120))),
	}))
	.head(() => ({ title: "Playground — Flare docs" }))
	.render((props) => {
		const tip = useDeferred(() => props.loaderData.tip);
		const calls = useCalls();
		return (
			<main class="mx-auto grid max-w-5xl gap-5 px-5 py-10 md:grid-cols-2">
				<h1 class="text-3xl font-semibold tracking-tight md:col-span-2">Playground</h1>
				<p id="tip" class="text-sm text-stone-500 md:col-span-2">
					<Loading fallback="Loading a tip…">{tip()}</Loading>
				</p>
				<EchoCard calls={calls} />
				<ErrorsCard calls={calls} />
				<Result calls={calls} />
				<StreamCard />
				<NotesCard />
			</main>
		);
	});
