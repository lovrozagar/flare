/** @vitest-environment node */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts"
import { createFileSystemStore } from "../../../src/store/filesystem.ts"

/**
 * Test the auto-injection logic in isolation.
 * The actual wiring lives in createServerHandler, but we test the decision logic here.
 */
function resolveDevStore(
	isDev: boolean,
	userStore: FlareStore | undefined,
	createFsStore: () => FlareStore,
): FlareStore | undefined {
	if (isDev && !userStore) {
		return createFsStore()
	}
	return userStore
}

let cacheDir: string

beforeEach(() => {
	cacheDir = mkdtempSync(join(tmpdir(), "flare-dev-store-"))
})

afterEach(() => {
	rmSync(cacheDir, { force: true, recursive: true })
})

describe("dev store auto-injection", () => {
	it("isDev + no store → FileSystemStore created", () => {
		const store = resolveDevStore(true, undefined, () => createFileSystemStore({ cacheDir }))
		expect(store).toBeDefined()
	})

	it("isDev + store provided → user store used (not overridden)", () => {
		const userStore: FlareStore = {
			delete: vi.fn(),
			deleteByTags: vi.fn(),
			get: vi.fn(async () => null),
			set: vi.fn(),
		}
		const store = resolveDevStore(true, userStore, () => createFileSystemStore({ cacheDir }))
		expect(store).toBe(userStore)
	})

	it("!isDev + no store → no store (undefined)", () => {
		const store = resolveDevStore(false, undefined, () => createFileSystemStore({ cacheDir }))
		expect(store).toBeUndefined()
	})

	it("auto-injected store is functional", async () => {
		const store = resolveDevStore(true, undefined, () => createFileSystemStore({ cacheDir }))
		const entry: FlareStoreEntry = { data: { test: true }, storedAt: Date.now() }
		await store?.set("static:/test", entry)
		const result = await store?.get("static:/test")
		expect(result).toEqual(entry)
	})
})
