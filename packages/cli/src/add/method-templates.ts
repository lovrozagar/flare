export interface MethodTemplate {
	code: string
	method: string
}

export function authenticateTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.authenticate()`,
		method: "authenticate",
	}
}

export function authorizeTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.authorize((ctx) => {\n${indent}\t/* TODO: authorization logic */\n${indent}\treturn true\n${indent}})`,
		method: "authorize",
	}
}

export function cacheTemplate(
	indent: string,
	opts: { isr?: number; ssg?: boolean },
): MethodTemplate {
	if (opts.isr !== undefined) {
		return {
			code: `\n${indent}.cache({\n${indent}\tisr: {\n${indent}\t\trevalidate: ${opts.isr},\n${indent}\t},\n${indent}})`,
			method: "cache",
		}
	}
	return {
		code: `\n${indent}.cache({\n${indent}\tssg: true,\n${indent}})`,
		method: "cache",
	}
}

export function effectsTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.effects(() => {\n${indent}\t/* TODO: side effects */\n${indent}})`,
		method: "effects",
	}
}

export function errorRenderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.errorRender((ctx) => (\n${indent}\t<div>Something went wrong: {ctx.error.message}</div>\n${indent}))`,
		method: "errorRender",
	}
}

export function headTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.head(() => ({\n${indent}\ttitle: "Page Title",\n${indent}}))`,
		method: "head",
	}
}

export function headersTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.headers(() => ({\n${indent}\t"Cache-Control": "public, max-age=60",\n${indent}}))`,
		method: "headers",
	}
}

export function inputTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.input(z.object({\n${indent}\t/* TODO: define search params schema */\n${indent}}))`,
		method: "input",
	}
}

export function loaderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.loader(async () => {\n${indent}\t/* TODO: load data */\n${indent}\treturn {}\n${indent}})`,
		method: "loader",
	}
}

export function notFoundRenderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.notFoundRender(() => (\n${indent}\t<div>Not found</div>\n${indent}))`,
		method: "notFoundRender",
	}
}

export function preloaderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.preloader(async () => {\n${indent}\t/* TODO: preload data */\n${indent}})`,
		method: "preloader",
	}
}

export function unauthenticatedRenderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.unauthenticatedRender(() => (\n${indent}\t<div>Please sign in</div>\n${indent}))`,
		method: "unauthenticatedRender",
	}
}

export function unauthorizedRenderTemplate(indent: string): MethodTemplate {
	return {
		code: `\n${indent}.unauthorizedRender(() => (\n${indent}\t<div>Access denied</div>\n${indent}))`,
		method: "unauthorizedRender",
	}
}
