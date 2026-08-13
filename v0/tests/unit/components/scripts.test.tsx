/**
 * Scripts Component Unit Tests
 *
 * Tests SSR rendering of Flare state script with nonce support.
 */

import { renderToString } from "solid-js/web"
import { describe, expect, it } from "vitest"
import { Scripts } from "../../../src/components/scripts"
import { SSRContextProvider, type SSRContextValue } from "../../../src/components/ssr-context"

function renderWithContext(value: SSRContextValue): string {
	return renderToString(() => (
		<SSRContextProvider value={value}>
			<Scripts />
		</SSRContextProvider>
	))
}

describe("Scripts", () => {
	describe("SSR rendering", () => {
		it("renders nothing when no flareStateScript", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "",
			})
			expect(html).toBe("")
		})

		it("renders script tag with flare state", () => {
			const html = renderWithContext({
				flareStateScript: "self.flare={};",
				isServer: true,
				nonce: "",
			})
			expect(html).toContain("<script")
			expect(html).toContain("self.flare={};")
			expect(html).toContain("</script>")
		})

		it("renders script with nonce attribute", () => {
			const html = renderWithContext({
				flareStateScript: "self.flare={};",
				isServer: true,
				nonce: "abc123",
			})
			expect(html).toContain('nonce="abc123"')
		})

		it("renders complex flare state", () => {
			const script = "self.flare={r:{pathname:'/test'},m:{'/test':{loaderData:{foo:'bar'}}}};"
			const html = renderWithContext({
				flareStateScript: script,
				isServer: true,
				nonce: "",
			})
			expect(html).toContain("pathname:'/test'")
			expect(html).toContain("loaderData")
		})
	})

	describe("client rendering", () => {
		it("renders nothing on client (isServer=false)", () => {
			const html = renderWithContext({
				flareStateScript: "self.flare={};",
				isServer: false,
				nonce: "",
			})
			expect(html).toBe("")
		})
	})

	describe("edge cases", () => {
		it("renders nothing when context is undefined", () => {
			const html = renderToString(() => <Scripts />)
			expect(html).toBe("")
		})

		it("handles nonce without flare state", () => {
			const html = renderWithContext({
				flareStateScript: "",
				isServer: true,
				nonce: "abc123",
			})
			expect(html).toBe("")
		})
	})
})
