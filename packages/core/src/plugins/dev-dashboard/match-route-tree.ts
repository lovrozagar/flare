import { toLocaleMatch, type LocaleMatch } from "../../router-primitives/tree.ts";

export interface MatchTreeNode {
	children: MatchTreeNode[];
	segment: string;
}

export interface MatchedTreeRoute<T extends MatchTreeNode = MatchTreeNode> {
	node: T;
	params: Record<string, string>;
}

function localeAllows(paramName: string, value: string, localeMatch?: LocaleMatch): boolean {
	return !localeMatch || paramName !== localeMatch.paramName || localeMatch.locales.includes(value);
}

function optionalCatchAllName(seg: string): string | null {
	const m = /^\[\[\.\.\.(\w+)\]\]$/.exec(seg);
	return m?.[1] ?? null;
}

function catchAllName(seg: string): string | null {
	const m = /^\[\.\.\.(\w+)\]$/.exec(seg);
	return m?.[1] ?? null;
}

function optionalParamName(seg: string): string | null {
	const m = /^\[\[(\w+)\]\]$/.exec(seg);
	return m?.[1] ?? null;
}

function requiredParamName(seg: string): string | null {
	const m = /^\[(\w+)\]$/.exec(seg);
	return m?.[1] ?? null;
}

/**
 * Inspector matcher for the dashboard route tree.
 * Same locale allow-list as `matchRoute`: `[locale]` / `[[locale]]` only
 * consume declared locale values when `localeMatch` is set.
 */
export function matchRouteTree<T extends MatchTreeNode>(
	nodes: T[],
	pathname: string,
	localeMatch?: LocaleMatch,
): { chain: MatchedTreeRoute<T>[]; params: Record<string, string> } {
	const urlSegments = pathname.split("/").filter(Boolean);
	const params: Record<string, string> = {};
	const chain: MatchedTreeRoute<T>[] = [];

	function walk(children: T[], idx: number): boolean {
		for (const node of children) {
			const seg = node.segment;
			const isGroup = seg.startsWith("(") && seg.endsWith(")");
			const optCatch = optionalCatchAllName(seg);
			const catchAll = catchAllName(seg);
			const optionalName = optionalParamName(seg);
			const requiredName = requiredParamName(seg);

			if (isGroup) {
				chain.push({ node, params: {} });
				if (walk(node.children as T[], idx)) return true;
				chain.pop();
				continue;
			}

			if (optCatch) {
				const remaining = urlSegments.slice(idx);
				params[optCatch] = remaining.join("/");
				chain.push({ node, params: { [optCatch]: remaining.join("/") } });
				return true;
			}

			if (catchAll) {
				if (idx >= urlSegments.length) continue;
				const remaining = urlSegments.slice(idx);
				params[catchAll] = remaining.join("/");
				chain.push({ node, params: { [catchAll]: remaining.join("/") } });
				return true;
			}

			if (optionalName) {
				/* skip first — static siblings / descendants win */
				chain.push({ node, params: {} });
				if (walk(node.children as T[], idx)) return true;
				chain.pop();

				const currentSeg = urlSegments[idx];
				if (currentSeg !== undefined && localeAllows(optionalName, currentSeg, localeMatch)) {
					params[optionalName] = currentSeg;
					chain.push({ node, params: { [optionalName]: currentSeg } });
					if (walk(node.children as T[], idx + 1)) return true;
					if (idx + 1 === urlSegments.length) return true;
					delete params[optionalName];
					chain.pop();
				}
				continue;
			}

			const currentSeg = urlSegments[idx];

			if (requiredName) {
				if (idx >= urlSegments.length) continue;
				if (!localeAllows(requiredName, currentSeg ?? "", localeMatch)) continue;
				params[requiredName] = currentSeg ?? "";
				chain.push({ node, params: { [requiredName]: currentSeg ?? "" } });
				if (walk(node.children as T[], idx + 1)) return true;
				if (idx + 1 === urlSegments.length) return true;
				delete params[requiredName];
				chain.pop();
				continue;
			}

			if (seg === currentSeg || (seg === "/" && idx === urlSegments.length)) {
				chain.push({ node, params: {} });
				if (seg === "/" && idx === urlSegments.length) return true;
				if (walk(node.children as T[], idx + 1)) return true;
				if (idx + 1 === urlSegments.length) return true;
				chain.pop();
			}
		}
		return false;
	}

	if (nodes.length > 0) {
		const root = nodes[0];
		if (root) {
			chain.push({ node: root, params: {} });
			walk(root.children as T[], 0);
		}
	}

	return { chain, params };
}

function readLocaleCfg(value: unknown): { locales: readonly string[]; paramName?: string } | undefined {
	if (!value || typeof value !== "object") return undefined;
	const locales = (value as { locales?: unknown }).locales;
	if (!Array.isArray(locales) || locales.some((l) => typeof l !== "string")) return undefined;
	const paramName = (value as { paramName?: unknown }).paramName;
	return {
		locales: locales as string[],
		paramName: typeof paramName === "string" ? paramName : undefined,
	};
}

/**
 * Pull a `LocaleMatch` from a router module: named `localeConfig`, then
 * `router.locale` / `default.locale`.
 */
export function extractLocaleMatchFromModule(mod: Record<string, unknown>): LocaleMatch | undefined {
	const named = toLocaleMatch(readLocaleCfg(mod.localeConfig));
	if (named) return named;
	const router = (mod.router ?? mod.default) as Record<string, unknown> | undefined;
	if (router && typeof router === "object") {
		return toLocaleMatch(readLocaleCfg(router.locale));
	}
	return undefined;
}
