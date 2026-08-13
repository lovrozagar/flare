export interface GlobalBoundariesConfig {
	error?: string
	notFound?: string
	unauthorized?: string
}

export interface CssConfig {
	scoped?: boolean
}

export interface ServerFnConfig {
	exclude?: RegExp
	include?: RegExp
}

export interface FlareBuildConfig {
	clientEntryFilePath?: string
	css?: CssConfig | false
	generated?: {
		routesFilePath?: string
		typesFilePath?: string
	}
	globalBoundaries?: GlobalBoundariesConfig
	ignorePrefix?: string
	serverEntryFilePath?: string
	serverFn?: ServerFnConfig | false
	viewTransitions?: boolean
}

const MARKER = Symbol.for("flare/build-config")

export interface MarkedFlareBuildConfig extends FlareBuildConfig {
	[key: symbol]: true
}

export function createFlareBuild(config: FlareBuildConfig): MarkedFlareBuildConfig {
	return { ...config, [MARKER]: true } as MarkedFlareBuildConfig
}

export function isFlareBuildConfig(value: unknown): value is MarkedFlareBuildConfig {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		MARKER in (value as Record<symbol, unknown>) &&
		(value as Record<symbol, unknown>)[MARKER] === true
	)
}

export function validateFlareBuildConfig(value: unknown): string[] {
	const errors: string[] = []

	if (!isFlareBuildConfig(value)) {
		errors.push("Config missing flare/build-config marker — use createFlareBuild()")
		return errors
	}

	const config = value as FlareBuildConfig

	if (config.ignorePrefix !== undefined && typeof config.ignorePrefix !== "string") {
		errors.push(`ignorePrefix must be a string, got ${typeof config.ignorePrefix}`)
	}

	if (config.serverFn !== undefined && config.serverFn !== false) {
		if (typeof config.serverFn !== "object" || config.serverFn === null) {
			errors.push(`serverFn must be an object or false, got ${typeof config.serverFn}`)
		} else {
			if (config.serverFn.include !== undefined && !(config.serverFn.include instanceof RegExp)) {
				errors.push(`serverFn.include must be a RegExp, got ${typeof config.serverFn.include}`)
			}
			if (config.serverFn.exclude !== undefined && !(config.serverFn.exclude instanceof RegExp)) {
				errors.push(`serverFn.exclude must be a RegExp, got ${typeof config.serverFn.exclude}`)
			}
		}
	}

	if (config.css !== undefined && config.css !== false) {
		if (typeof config.css !== "object" || config.css === null) {
			errors.push(`css must be an object or false, got ${typeof config.css}`)
		}
	}

	return errors
}
