import type { JSX } from "@solidjs/web";
import type { InternalChannel } from "./channel.ts";
import { BroadcastCtx, noopChannel } from "./context.ts";

export function BroadcastProvider(props: { children: JSX.Element; value?: InternalChannel }): JSX.Element {
	return <BroadcastCtx value={props.value ?? noopChannel}>{props.children}</BroadcastCtx>;
}
