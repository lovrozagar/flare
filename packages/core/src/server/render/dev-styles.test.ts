import { afterEach, expect, it, vi } from "vitest";
import { STYLES_EVENT } from "../../shared/protocol/index.ts";
import { stylesClient } from "./dev-styles.ts";

afterEach(() => {
	vi.useRealTimers();
});

// A loopback channel: what the server sends, and the dev server's replies it hears.
function channel() {
	const sent: unknown[] = [];
	let hear: ((payload: unknown) => void) | undefined;
	return {
		hot: {
			send: (event: string, payload: unknown) => void sent.push({ event, payload }),
			on: (event: string, listener: (payload: unknown) => void) => {
				expect(event).toBe(STYLES_EVENT);
				hear = listener;
			},
		},
		sent,
		reply: (payload: unknown) => hear?.(payload),
	};
}

// A request names its route ids and a number; the reply with that number settles it (B104).
it("round trip", async () => {
	const { hot, sent, reply } = channel();
	const styles = stylesClient(hot, () => undefined);
	const first = styles(["_root_", "_root_/"]);
	const second = styles(["_root_"]);
	expect(sent).toEqual([
		{ event: STYLES_EVENT, payload: { request: 0, routes: ["_root_", "_root_/"] } },
		{ event: STYLES_EVENT, payload: { request: 1, routes: ["_root_"] } },
	]);
	reply({ request: 1, styles: [{ id: "/a.css", css: "a{}" }] });
	reply({ request: 9, styles: [] });
	reply("not a reply");
	reply({ request: 0, styles: [{ id: "/b.css", css: "b{}" }, { id: 7 }] });
	expect(await second).toEqual([{ id: "/a.css", css: "a{}" }]);
	expect(await first).toEqual([{ id: "/b.css", css: "b{}" }]);
});

// No answer within 2 s: the document renders without dev styles, and the dev server logs one warning.
it("bounded wait", async () => {
	vi.useFakeTimers();
	const { hot, reply } = channel();
	const warn = vi.fn<(message: string) => void>();
	const pending = stylesClient(hot, warn)(["_root_"]);
	vi.advanceTimersByTime(2000);
	expect(await pending).toEqual([]);
	expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("2000 ms"));
	reply({ request: 0, styles: [{ id: "/late.css", css: "" }] });
	expect(warn).toHaveBeenCalledOnce();
});
