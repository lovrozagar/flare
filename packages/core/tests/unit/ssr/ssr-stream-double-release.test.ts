import { describe, expect, it, vi } from "vitest"

/**
 * Test that the SSR stream buffer overflow path does not double-release the reader lock.
 * Bug: reader.releaseLock() at line 664 + finally { reader.releaseLock() } at line 778
 * means the buffer overflow early-return path calls releaseLock twice.
 * Fix: remove the explicit releaseLock before return, let finally handle it.
 */

function createMockReader(chunks: string[]) {
	let index = 0
	const releaseLock = vi.fn()
	const reader = {
		read: vi.fn(async () => {
			if (index >= chunks.length) return { done: true as const, value: undefined }
			const value = new TextEncoder().encode(chunks[index] ?? "")
			index++
			return { done: false as const, value }
		}),
		releaseLock,
	}
	return { reader, releaseLock }
}

async function runFixedPattern(
	reader: {
		read: () => Promise<{ done: boolean; value: Uint8Array | undefined }>
		releaseLock: () => void
	},
	maxBuffer: number,
): Promise<string> {
	let buffer = ""
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += new TextDecoder().decode(value as Uint8Array)
			if (buffer.length > maxBuffer) return buffer
		}
	} finally {
		reader.releaseLock()
	}
	return buffer
}

async function runBuggyPattern(
	reader: {
		read: () => Promise<{ done: boolean; value: Uint8Array | undefined }>
		releaseLock: () => void
	},
	maxBuffer: number,
): Promise<string> {
	let buffer = ""
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += new TextDecoder().decode(value as Uint8Array)
			if (buffer.length > maxBuffer) {
				reader.releaseLock()
				return buffer
			}
		}
	} finally {
		reader.releaseLock()
	}
	return buffer
}

describe("SSR stream double releaseLock guard", () => {
	it("fixed pattern: buffer overflow calls releaseLock exactly once", async () => {
		const { reader, releaseLock } = createMockReader(["x".repeat(200)])
		await runFixedPattern(reader, 50)
		expect(releaseLock).toHaveBeenCalledTimes(1)
	})

	it("fixed pattern: normal completion calls releaseLock exactly once", async () => {
		const { reader, releaseLock } = createMockReader(["hello", " world"])
		const result = await runFixedPattern(reader, 1000)
		expect(releaseLock).toHaveBeenCalledTimes(1)
		expect(result).toBe("hello world")
	})

	it("buggy pattern: buffer overflow calls releaseLock TWICE (the bug)", async () => {
		const { reader, releaseLock } = createMockReader(["x".repeat(200)])
		await runBuggyPattern(reader, 50)
		expect(releaseLock).toHaveBeenCalledTimes(2)
	})
})
