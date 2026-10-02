import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "../../../src/locale.ts";
import { hydrateClient } from "../../hydrate-client.ts";

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

const CONFIG = { defaultLocale: "en", locales: ["en", "hr"] as const };

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	document.documentElement.removeAttribute("lang");
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
});

describe("LocaleProvider hydration", () => {
	it("hydrate → still provides useLocale context", async () => {
		let locale: string | undefined;
		dispose = hydrateClient(
			() => (
				<LocaleProvider config={CONFIG} initial="hr">
					{(() => {
						locale = useLocale().locale();
						return null;
					})()}
				</LocaleProvider>
			),
			container,
		);
		expect(locale).toBe("hr");
		await tick();
		expect(document.documentElement.getAttribute("lang")).toBe("hr");
	});
});
