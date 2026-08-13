import { AsyncLocalStorage } from "node:async_hooks"

export interface LazyComponent {
	preload(): Promise<unknown>
}

export interface Registry {
	get(key: string): LazyComponent | undefined
	keys(): string[]
}

export interface RegistryTrackingResult<R> {
	dk: () => string[]
	result: R
}

const trackingStore = new AsyncLocalStorage<Set<string>>()
const registries: Registry[] = []

export function createRegistry<T extends Record<string, LazyComponent>>(components: T): Registry {
	const proxy = new Proxy(components, {
		get(target, prop, receiver) {
			const store = trackingStore.getStore()
			if (store && typeof prop === "string" && prop !== "keys") {
				store.add(prop)
			}
			return Reflect.get(target, prop, receiver)
		},
	})

	return {
		get(key: string) {
			return proxy[key]
		},
		keys() {
			return Object.keys(components)
		},
	}
}

export function withRegistryTracking<R>(fn: () => R): RegistryTrackingResult<R> {
	const tracked = new Set<string>()
	const result = trackingStore.run(tracked, fn)
	return {
		dk: () => Array.from(tracked),
		result,
	}
}

export function dk(): string[] {
	const store = trackingStore.getStore()
	return store ? Array.from(store) : []
}

export function registerRegistry(registry: Registry): void {
	registries.push(registry)
}

export function getRegisteredRegistries(): Registry[] {
	return registries
}

export function scanStringsForPreload(
	data: unknown,
	regs: Registry[],
	preloads: Promise<unknown>[],
): void {
	if (data === null || data === undefined) return

	if (typeof data === "string") {
		for (const reg of regs) {
			const component = reg.get(data)
			if (component) {
				preloads.push(component.preload())
			}
		}
		return
	}

	if (Array.isArray(data)) {
		for (const item of data) {
			scanStringsForPreload(item, regs, preloads)
		}
		return
	}

	if (typeof data === "object") {
		for (const value of Object.values(data)) {
			scanStringsForPreload(value, regs, preloads)
		}
	}
}
