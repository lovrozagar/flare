import type { HeadConfig } from "../route-builder/types.ts";

// The replace rules of B83. Single values replace, records shallow-merge with the child key winning, and lists
// concatenate. `replace` makes the child the whole head.
export function mergeHead(parent: HeadConfig, child: HeadConfig, replace = false): HeadConfig {
	if (replace) return child;
	const parentCustom = parent.custom ?? {};
	const childCustom = child.custom ?? {};
	return {
		title: pick(child.title, parent.title),
		description: pick(child.description, parent.description),
		keywords: pick(child.keywords, parent.keywords),
		canonical: pick(child.canonical, parent.canonical),
		css: pick(child.css, parent.css),
		languages: shallow(parent.languages, child.languages),
		meta: shallow(parent.meta, child.meta),
		robots: shallow(parent.robots, child.robots),
		openGraph: shallow(parent.openGraph, child.openGraph),
		twitter: shallow(parent.twitter, child.twitter),
		favicons: shallow(parent.favicons, child.favicons),
		images: [...list(parent.images), ...list(child.images)],
		jsonLd: [...list(parent.jsonLd), ...list(child.jsonLd)],
		custom: {
			links: [...list(parentCustom.links), ...list(childCustom.links)],
			meta: [...list(parentCustom.meta), ...list(childCustom.meta)],
			scripts: [...list(parentCustom.scripts), ...list(childCustom.scripts)],
			styles: [...list(parentCustom.styles), ...list(childCustom.styles)],
		},
	};
}

const pick = <T>(child: T | undefined, parent: T | undefined): T | undefined => (child === undefined ? parent : child);

// A record neither side set stays absent: an empty `openGraph` or `robots` would still write its defaults.
function shallow<T extends object>(parent: T | undefined, child: T | undefined): T | undefined {
	if (parent === undefined) return child;
	if (child === undefined) return parent;
	return { ...parent, ...child };
}
const list = <T>(value: readonly T[] | undefined): T[] => (value ? [...value] : []);
