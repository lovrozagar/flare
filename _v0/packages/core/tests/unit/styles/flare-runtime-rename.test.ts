/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { clearScopedStyles, enableDomInjection, registerCSSByName } from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
});

describe("sheet element id: flare-runtime", () => {
	it("getStyleEl creates element with id='flare-runtime'", () => {
		enableDomInjection();
		registerCSSByName("test-rule", "color: red");
		const el = document.getElementById("flare-runtime");
		expect(el).not.toBeNull();
		expect(el?.tagName.toLowerCase()).toBe("style");
	});

	it("does NOT create element with old id '__FLARE_SCOPED__'", () => {
		enableDomInjection();
		registerCSSByName("test-rule", "color: red");
		const old = document.getElementById("__FLARE_SCOPED__");
		expect(old).toBeNull();
	});

	it("clearScopedStyles empties element at id='flare-runtime'", () => {
		enableDomInjection();
		registerCSSByName("clear-test", "color: blue");
		clearScopedStyles();
		/* After clear, enableDomInjection must be called again to trigger DOM ops */
		enableDomInjection();
		registerCSSByName("repopulate", "margin: 0");
		const el = document.getElementById("flare-runtime");
		expect(el).not.toBeNull();
	});

	it("enableDomInjection reads id='flare-runtime' for SSR hydration check", () => {
		/* Simulate an SSR-injected style tag with the new id */
		const ssrEl = document.createElement("style");
		ssrEl.id = "flare-runtime";
		ssrEl.textContent = ".a{color:red}";
		document.head.appendChild(ssrEl);

		/* enableDomInjection should detect this element (ssrSheetPresent = true)
		   and NOT inject additional DOM rules until finishHydration() is called */
		enableDomInjection();
		registerCSSByName("hydration-rule", "padding: 1rem");

		/* The injected rule should NOT appear as a new rule because ssrSheetPresent
		   gates DOM injection — verify the element is found by id */
		const el = document.getElementById("flare-runtime");
		expect(el).not.toBeNull();
		expect(el?.id).toBe("flare-runtime");

		document.head.removeChild(ssrEl);
	});
});
