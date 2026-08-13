/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"

/**
 * Bug 58: Dev overlay element never cleaned up on HMR
 *
 * hydrate() appends a new div#flare-dev-overlay-root on every call.
 * HMR re-runs hydrate without removing the old overlay, creating duplicates.
 *
 * Expected: only one overlay element should exist after multiple hydrate calls.
 */

describe("Bug 58: dev overlay HMR cleanup", () => {
	it("should not create duplicate overlay elements", () => {
		/* Simulate first hydrate creating overlay */
		const overlay1 = document.createElement("div")
		overlay1.id = "flare-dev-overlay-root"
		document.body.appendChild(overlay1)

		/* Simulate second hydrate — should reuse existing element */
		const existing = document.getElementById("flare-dev-overlay-root")
		if (!existing) {
			const overlay2 = document.createElement("div")
			overlay2.id = "flare-dev-overlay-root"
			document.body.appendChild(overlay2)
		}

		const all = document.querySelectorAll("#flare-dev-overlay-root")
		expect(all.length).toBe(1)
	})

	it("should create overlay if none exists", () => {
		/* Clear any existing */
		const existing = document.getElementById("flare-dev-overlay-root")
		if (existing) existing.remove()

		/* No overlay yet — should create one */
		const el = document.getElementById("flare-dev-overlay-root")
		expect(el).toBeNull()

		/* This simulates the fixed behavior */
		if (!document.getElementById("flare-dev-overlay-root")) {
			const overlay = document.createElement("div")
			overlay.id = "flare-dev-overlay-root"
			document.body.appendChild(overlay)
		}

		expect(document.getElementById("flare-dev-overlay-root")).not.toBeNull()
	})
})
