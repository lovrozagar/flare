import { expect, it, vi } from "vitest";
import { createTabs, tabbedPayload } from "./tabs.ts";

function tab() {
	return { send: vi.fn<(payload: unknown) => void>() };
}

// The handler wiring is in handler.test.ts (`other tab silent`, `document error after connect`). These are the hub's
// own edges: one client under two tokens, the message shapes, and the token and its tag (BUGS.md B42).
it("hub", () => {
	const tabs = createTabs();
	const client = tab();
	tabs.announce("one", client);
	tabs.announce("two", client);
	tabs.deliver("two", "p");
	expect(client.send).toHaveBeenCalledExactlyOnceWith("p");
	tabs.drop(client);
	tabs.deliver("one", "q");
	tabs.deliver(undefined, "r");
	expect(client.send).toHaveBeenCalledOnce();
	const later = tab();
	tabs.announce("one", later);
	expect(later.send).toHaveBeenCalledExactlyOnceWith("q");
});

it("message", () => {
	expect(tabbedPayload({ token: "t", payload: 1 })).toEqual({ token: "t", payload: 1 });
	expect(tabbedPayload({ token: 2, payload: 1 })).toEqual({ token: undefined, payload: 1 });
	expect(tabbedPayload(null)).toEqual({ token: undefined, payload: undefined });
});
