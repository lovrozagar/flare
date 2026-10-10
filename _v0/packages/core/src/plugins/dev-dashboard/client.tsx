import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { render } from "@solidjs/web";
import type { LocaleMatch } from "../../router-primitives/tree.ts";
import { matchRouteTree } from "./match-route-tree.ts";

/* ── Types (mirror plugin.ts) ────────────────────────────────────────── */

interface RouteTreeNode {
	auth: false | "optional" | true;
	cache: Record<string, unknown>;
	children: RouteTreeNode[];
	filePath: string | null;
	hasInput: boolean;
	intercept?: Record<string, unknown>;
	responseRoute: boolean;
	segment: string;
	type: "layout" | "page" | "path-segment" | "root-layout" | "segment";
	urlPath: string;
	virtualPath: string | null;
}

interface RouteDef {
	authenticateMode: false | "optional" | true;
	cache: Record<string, unknown>;
	exportName: string;
	filePath: string;
	hasInput: boolean;
	intercept?: Record<string, unknown>;
	responseRoute: boolean;
	type: "layout" | "page" | "path-segment" | "root-layout";
	virtualPath: string;
}

interface ServerFnInfo {
	authenticate: boolean;
	file: string;
	id: string;
	method: string;
	name: string;
	stream: boolean;
}

interface ApiData {
	builderChains: Record<string, string[]>;
	defs: RouteDef[];
	localeMatch?: LocaleMatch;
	routeTree: RouteTreeNode[];
	serverFunctions: ServerFnInfo[];
}

interface MatchedRoute {
	node: RouteTreeNode;
	params: Record<string, string>;
}

interface RuntimeMatch {
	loaderData: unknown;
	preloaderContext?: Record<string, unknown>;
	type: string;
	virtualPath: string;
}

interface CachedMatchInfo {
	data: unknown;
	headConfig?: Record<string, unknown>;
	matchId: string;
	updatedAt: number;
}

interface DevtoolsActions {
	clearError: () => void;
	clearPrefetchCache: () => void;
	getCacheStats: () => {
		entries: { age: number; matchId: string }[];
		matchCount: number;
		prefetchCount: number;
	};
	invalidate: (options?: { revalidate?: boolean }) => void;
	navigate: (options: { params?: Record<string, unknown>; replace?: boolean; to: string }) => Promise<void>;
	prefetch: (options: { to: string }) => Promise<void>;
	setError: (error: unknown) => void;
	setNotFound: (v: boolean) => void;
}

declare global {
	interface Window {
		__flare_devtools_actions__?: DevtoolsActions;
		__flare_devtools_cache__?: CachedMatchInfo[];
		__flare_devtools_matches__?: RuntimeMatch[];
	}
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

type TabId = "actions" | "current" | "layouts" | "pages" | "root-layouts" | "segments" | "server-fns" | "tree";

const TABS: { id: TabId; label: string }[] = [
	{ id: "current", label: "Current" },
	{ id: "actions", label: "Global" },
	{ id: "tree", label: "Tree" },
	{ id: "pages", label: "Pages" },
	{ id: "layouts", label: "Layouts" },
	{ id: "root-layouts", label: "Root" },
	{ id: "segments", label: "Segments" },
	{ id: "server-fns", label: "Server Fns" },
];

const TAB_TO_DEF_TYPE: Record<string, RouteDef["type"]> = {
	layouts: "layout",
	pages: "page",
	"root-layouts": "root-layout",
	segments: "path-segment",
};

/* ── Persistence ──────────────────────────────────────────────────────── */

const STORAGE_KEY = "__flare_devtools";

function loadState(): {
	activeTab: TabId;
	expandedNodes: string[];
	sortCol: string;
	sortDir: "asc" | "desc";
} {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			return {
				activeTab: (parsed.activeTab as TabId) ?? "current",
				expandedNodes: (parsed.expandedNodes as string[]) ?? [],
				sortCol: (parsed.sortCol as string) ?? "name",
				sortDir: (parsed.sortDir as "asc" | "desc") ?? "asc",
			};
		}
	} catch {
		/* noop */
	}
	return { activeTab: "current", expandedNodes: [], sortCol: "name", sortDir: "asc" };
}

function saveState(s: { activeTab: TabId; expandedNodes: string[]; sortCol: string; sortDir: string }): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {
		/* noop */
	}
}

/* ── Badge helpers ────────────────────────────────────────────────────── */

function typeBadgeColor(type: string): string {
	switch (type) {
		case "page":
			return "#fafafa";
		case "layout":
			return "#a1a1aa";
		case "root-layout":
			return "#3b82f6";
		case "path-segment":
			return "#71717a";
		case "segment":
			return "#52525b";
		default:
			return "#52525b";
	}
}

function typeBadgeLabel(type: string): string {
	switch (type) {
		case "page":
			return "PAGE";
		case "layout":
			return "LYT";
		case "root-layout":
			return "ROOT";
		case "path-segment":
			return "SEG";
		case "segment":
			return "DIR";
		default:
			return type.toUpperCase();
	}
}

/* ── CSS ──────────────────────────────────────────────────────────────── */

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }

:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  color: #e4e4e7;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.toggle-btn {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 2147483646;
  width: 32px;
  height: 32px;
  border-radius: 2px;
  border: 1px solid #27272a;
  background: #09090b;
  color: #71717a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
}
.toggle-btn:hover {
  border-color: #3b82f6;
  color: #fafafa;
}
.toggle-btn:active { opacity: 0.8; }
.toggle-btn.is-open {
  display: none;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 2px;
  width: min(1280px, calc(100vw - 48px));
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
@media (max-width: 640px) {
  .modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
  }
  .overlay {
    background: #09090b;
  }
}

.header {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  border-bottom: 1px solid #27272a;
  background: #09090b;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .header { padding: 0; gap: 0; }
}

.tab-bar {
  display: flex;
  gap: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-bar::-webkit-scrollbar { display: none; }

.tab-btn {
  padding: 8px 14px;
  border-radius: 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  white-space: nowrap;

}
.tab-btn:hover { color: #a1a1aa; }
.tab-btn.active {
  color: #fafafa;
  border-bottom-color: #3b82f6;
}

.tab-count {
  font-size: 10px;
  color: #3f3f46;
  margin-left: 4px;
}
.tab-btn.active .tab-count { color: #52525b; }
@media (max-width: 640px) {
  .tab-btn { padding: 6px 10px; font-size: 11px; }
  .tab-count { font-size: 9px; }
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 0;
  border: none;
  border-left: 1px solid #27272a;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-family: inherit;
  flex-shrink: 0;
}
.close-btn:hover { background: #18181b; color: #fafafa; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #27272a;
  background: #09090b;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .toolbar { padding: 4px 8px; }
}

.search-input {
  flex: 1;
  background: #0f0f12;
  border: 1px solid #27272a;
  border-radius: 2px;
  padding: 5px 8px;
  color: #e4e4e7;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.search-input:focus { border-color: #3b82f6; }
.search-input::placeholder { color: #3f3f46; }

.content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  scrollbar-width: thin;
  scrollbar-color: #27272a #09090b;
}
@media (max-width: 640px) {
  .content { padding: 6px 8px; }
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-track { background: #09090b; }
.content::-webkit-scrollbar-thumb {
  background: #27272a;
  border-radius: 0;
}
.content::-webkit-scrollbar-thumb:hover { background: #3f3f46; }

.vlist {
  position: relative;
  padding: 0 12px;
}
@media (max-width: 640px) {
  .vlist { padding: 0 8px; }
}
.vlist-inner {
  position: relative;
  width: 100%;
}
.vlist-window {
  position: absolute;
  left: 0;
  right: 0;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  border-top: 1px solid #27272a;
  background: #09090b;
  font-size: 11px;
  color: #3f3f46;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .status-bar {
    gap: 8px;
    padding: 4px 8px;
    font-size: 10px;
  }
}

/* ── Tree ──────────────────────────────────────────────────────────── */

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  cursor: pointer;
  border-radius: 0;
  height: 22px;
  white-space: nowrap;
  min-width: 0;
  font-size: 12px;
  border-left: 2px solid transparent;
}
.tree-row:hover { background: #18181b; border-left-color: #27272a; }

.tree-prefix {
  color: #27272a;
  user-select: none;
  white-space: pre;
  flex-shrink: 0;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  font-size: 11px;
}

.tree-badge {
  display: inline-block;
  padding: 0 4px;
  border-radius: 1px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  line-height: 16px;
  flex-shrink: 0;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}

.tree-segment {
  color: #e4e4e7;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.tree-segment.is-group { color: #71717a; font-style: italic; }
.tree-segment.is-param { color: #3b82f6; }

.tree-path {
  color: #3f3f46;
  margin-left: auto;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
  flex-shrink: 1;
  min-width: 0;
}
@media (max-width: 768px) {
  .tree-path { display: none; }
}
@media (max-width: 640px) {
  .tree-url { display: none; }
}

.tree-url {
  color: #52525b;
  font-size: 11px;
  margin-left: 6px;
}

/* ── Typed list ────────────────────────────────────────────────────── */

.list-item {
  padding: 8px 10px;
  border-bottom: 1px solid #1a1a1e;
  cursor: pointer;

  overflow: hidden;
}
.list-item:hover { background: #18181b; }

.list-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.list-item-url {
  color: #e4e4e7;
  font-weight: 500;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.list-item-badges {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 1px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  line-height: 14px;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}
.badge-blue { background: #18181b; color: #71717a; border: 1px solid #27272a; }
.badge-green { background: #18181b; color: #71717a; border: 1px solid #27272a; }
.badge-yellow { background: #18181b; color: #a1a1aa; border: 1px solid #27272a; }
.badge-red { background: #18181b; color: #fafafa; border: 1px solid #3f3f46; }
.badge-purple { background: #18181b; color: #71717a; border: 1px solid #27272a; }
.badge-cyan { background: #18181b; color: #71717a; border: 1px solid #27272a; }
.badge-orange { background: #18181b; color: #a1a1aa; border: 1px solid #27272a; }

.list-item-file {
  background: none;
  border: none;
  color: #3f3f46;
  cursor: pointer;
  display: block;
  font: inherit;
  font-size: 11px;
  margin-top: 2px;
  overflow: hidden;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.list-item-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #1a1a1e;
  font-size: 12px;
  color: #a1a1aa;
}

.detail-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.detail-label { color: #3f3f46; min-width: 80px; flex-shrink: 0; font-size: 11px; }
.detail-value { color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
@media (max-width: 480px) {
  .detail-row { flex-direction: column; gap: 2px; }
  .detail-label { min-width: 0; }
}

/* ── Server Fns table ──────────────────────────────────────────────── */

.fn-table-wrap {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #27272a #09090b;
}
.fn-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 500px;
}

.fn-table th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid #27272a;
  color: #3f3f46;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.fn-table th:hover { color: #71717a; }
.fn-table th.sorted { color: #3b82f6; }

.fn-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #1a1a1e;
  font-size: 12px;
  color: #a1a1aa;
}

.fn-table tr:hover td { background: #18181b; }

.method-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 1px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  border: 1px solid #27272a;
}
.method-get { background: transparent; color: #71717a; }
.method-post { background: transparent; color: #e4e4e7; border-color: #3f3f46; }
.method-put { background: transparent; color: #a1a1aa; }
.method-delete { background: transparent; color: #fafafa; border-color: #52525b; }

.file-link {
  color: #3f3f46;
  cursor: pointer;
  text-decoration: none;
}
.file-link:hover { color: #3b82f6; text-decoration: underline; }

/* ── Current tab ───────────────────────────────────────────────────── */

.cur-grid {
  display: grid;
  gap: 1px;
  background: #27272a;
  border: 1px solid #27272a;
  border-radius: 2px;
  overflow: hidden;
}

.cur-section {
  background: #09090b;
  border: none;
  border-radius: 0;
  padding: 10px 12px;
}

.cur-label {
  font-size: 10px;
  font-weight: 600;
  color: #3f3f46;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
}

.cur-path-rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cur-path-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12px;
}
.cur-path-label {
  color: #3f3f46;
  font-size: 10px;
  font-weight: 600;
  min-width: 52px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.cur-path-value {
  color: #e4e4e7;
  word-break: break-all;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  font-size: 12px;
}
.cur-url-search { color: #71717a; }
.cur-url-hash { color: #52525b; }

.cur-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 11px;
}
.cur-meta-item { display: flex; gap: 6px; align-items: center; }
.cur-meta-key { color: #3f3f46; font-weight: 500; }
.cur-meta-val { color: #a1a1aa; font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace; }

.cur-chain {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cur-chain-node {
  border: 1px solid #1a1a1e;
  border-radius: 0;
  padding: 8px 10px;
  cursor: pointer;

}
.cur-chain-node:hover { background: #18181b; }
.cur-chain-node + .cur-chain-node,
.cur-chain-arrow + .cur-chain-node { border-top: none; }

.cur-chain-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.cur-chain-seg { color: #e4e4e7; font-weight: 500; }
.cur-chain-seg.is-group { color: #52525b; font-style: italic; }
.cur-chain-seg.is-param { color: #3b82f6; }
.cur-chain-file {
  background: none;
  border: none;
  color: #3f3f46;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  margin-left: auto;
  max-width: 280px;
  overflow: hidden;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cur-chain-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 6px;
}

.cur-method {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 1px;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.3px;
  border: 1px solid #27272a;
  background: transparent;
  color: #52525b;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}
.cur-method.is-auth { color: #a1a1aa; border-color: #3f3f46; }
.cur-method.is-data { color: #3b82f6; border-color: #1d4ed8; }
.cur-method.is-cache { color: #71717a; border-color: #27272a; }
.cur-method.is-render { color: #a1a1aa; border-color: #3f3f46; }
.cur-method.is-head { color: #71717a; border-color: #27272a; }
.cur-method.is-error { color: #a1a1aa; border-color: #3f3f46; }

.cur-chain-arrow {
  text-align: center;
  color: #27272a;
  font-size: 10px;
  line-height: 1;
  padding: 1px 0;
}

.cur-chain-config {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #1a1a1e;
  font-size: 11px;
}
.cur-config-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.cur-config-key {
  color: #3f3f46;
  min-width: 60px;
  flex-shrink: 0;
  font-weight: 500;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.cur-config-val {
  color: #a1a1aa;
  word-break: break-all;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}
.cur-config-pre {
  margin: 0;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  font-size: 11px;
  color: #71717a;
  background: #0a0a0c;
  border: 1px solid #1a1a1e;
  border-radius: 0;
  padding: 6px 8px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  scrollbar-width: thin;
  scrollbar-color: #27272a #0a0a0c;
}

.cur-params {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 12px;
}
.cur-param-key {
  color: #3b82f6;
  font-weight: 500;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}
.cur-param-val {
  color: #e4e4e7;
  margin-left: 4px;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}

.cur-state {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 11px;
}
.cur-state-item { display: flex; gap: 4px; }
.cur-state-key { color: #3f3f46; text-transform: uppercase; font-size: 10px; }
.cur-state-val { color: #e4e4e7; }

.cur-head-tags {
  font-size: 11px;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  max-height: 180px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #27272a #09090b;
}
.cur-head-tag {
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cur-head-tag-name { color: #3f3f46; }
.cur-head-attr-key { color: #71717a; }
.cur-head-attr-val { color: #a1a1aa; }

@media (max-width: 768px) {
  .cur-chain-file { display: none; }
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #3f3f46;
}

/* ── Actions tab ───────────────────────────────────────────────────── */

.act-grid {
  display: grid;
  gap: 1px;
  background: #27272a;
  border: 1px solid #27272a;
  border-radius: 2px;
  overflow: hidden;
}

.act-section {
  background: #09090b;
  padding: 10px 12px;
}

.act-label {
  font-size: 10px;
  font-weight: 600;
  color: #3f3f46;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}

.act-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.act-btn {
  border: 1px solid #27272a;
  background: transparent;
  color: #a1a1aa;
  border-radius: 1px;
  padding: 4px 10px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.act-btn:hover { border-color: #3b82f6; color: #e4e4e7; }
.act-btn:active { background: #18181b; }
.act-btn.is-danger:hover { border-color: #ef4444; color: #fafafa; }
.act-btn.is-copied { border-color: #22c55e; color: #22c55e; pointer-events: none; }

.act-stat {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}
.act-stat-key {
  color: #3f3f46;
  font-weight: 500;
}
.act-stat-val {
  color: #e4e4e7;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}

.act-select {
  background: #0f0f12;
  border: 1px solid #27272a;
  border-radius: 2px;
  padding: 4px 8px;
  color: #e4e4e7;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  flex: 1;
  min-width: 0;
}
.act-select:focus { border-color: #3b82f6; }

.act-input {
  background: #0f0f12;
  border: 1px solid #27272a;
  border-radius: 2px;
  padding: 4px 8px;
  color: #e4e4e7;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  min-width: 60px;
}
.act-input:focus { border-color: #3b82f6; }
.act-input::placeholder { color: #3f3f46; }

.act-param-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}
.act-param-label {
  color: #3b82f6;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  min-width: 40px;
}

.act-cache-list {
  margin-top: 8px;
  max-height: 140px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #27272a #09090b;
}
.act-cache-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 11px;
  border-bottom: 1px solid #1a1a1e;
}
.act-cache-id {
  color: #71717a;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.act-cache-age {
  color: #3f3f46;
  font-size: 10px;
  flex-shrink: 0;
  margin-left: 8px;
}

.act-doc-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  padding: 3px 0;
}
.act-doc-key {
  color: #3f3f46;
  font-weight: 500;
  min-width: 50px;
}
.act-doc-val {
  color: #e4e4e7;
  font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
}

@media (max-width: 480px) {
  .act-row { gap: 4px; }
  .act-btn { padding: 3px 8px; font-size: 10px; }
  .act-param-row { flex-direction: column; align-items: stretch; }
}
`;

/* ── Virtual list ─────────────────────────────────────────────────────── */

function VirtualList<T>(props: {
	containerRef?: (el: HTMLDivElement) => void;
	each: T[];
	estimateHeight: number;
	render: (item: T, index: number) => ReturnType<(typeof import("solid-js"))["createComponent"]>;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	let scrollEl: HTMLDivElement | null = null;
	const [scrollTop, setScrollTop] = createSignal(0);
	const [viewHeight, setViewHeight] = createSignal(500);

	const totalHeight = () => props.each.length * props.estimateHeight;

	const visibleRange = () => {
		const top = scrollTop();
		const height = viewHeight();
		const overscan = 5;
		const startIdx = Math.max(0, Math.floor(top / props.estimateHeight) - overscan);
		const endIdx = Math.min(props.each.length, Math.ceil((top + height) / props.estimateHeight) + overscan);
		return { endIdx, startIdx };
	};

	const visibleItems = () => {
		const { endIdx, startIdx } = visibleRange();
		const items: { idx: number; item: T }[] = [];
		for (let i = startIdx; i < endIdx; i++) {
			const item = props.each[i];
			if (item !== undefined) items.push({ idx: i, item });
		}
		return items;
	};

	const onScroll = () => {
		if (scrollEl) {
			setScrollTop(scrollEl.scrollTop);
			setViewHeight(scrollEl.clientHeight);
		}
	};

	createEffect(
		() => scrollEl,
		(el) => {
			if (el) {
				setViewHeight(el.clientHeight);
				if (props.containerRef) props.containerRef(el);
			}
		},
	);

	return (
		<div
			class="content"
			onScroll={onScroll}
			ref={(el) => {
				scrollEl = el;
			}}
		>
			<div class="vlist">
				<div class="vlist-inner" style={{ height: `${totalHeight()}px` }}>
					<div class="vlist-window" style={{ top: `${visibleRange().startIdx * props.estimateHeight}px` }}>
						<For each={visibleItems()}>{(entry) => props.render(entry.item, entry.idx)}</For>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ── Components ───────────────────────────────────────────────────────── */

function sortArrow(dir: "asc" | "desc"): string {
	if (dir === "asc") return " \u2191";
	return " \u2193";
}

function openEditor(file: string): void {
	fetch(`/__flare/open-editor?file=${encodeURIComponent(file)}`);
}

function matchesSearch(node: RouteTreeNode, term: string): boolean {
	if (!term) return true;
	const lower = term.toLowerCase();
	if (node.segment.toLowerCase().includes(lower)) return true;
	if (node.filePath?.toLowerCase().includes(lower)) return true;
	if (node.urlPath.toLowerCase().includes(lower)) return true;
	return node.children.some((c) => matchesSearch(c, term));
}

function TreeRow(props: {
	node: RouteTreeNode;
	prefix: string;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const isGroup = () => props.node.segment.startsWith("(") && props.node.segment.endsWith(")");
	const isParam = () => props.node.segment.startsWith("[") && props.node.segment.endsWith("]");
	const label = () => props.node.segment || props.node.virtualPath || "_root_";

	return (
		<button
			class="tree-row"
			onClick={() => {
				if (props.node.filePath) openEditor(props.node.filePath);
			}}
			type="button"
		>
			<span class="tree-prefix">{props.prefix}</span>
			<span
				class="tree-badge"
				style={{
					background: `${typeBadgeColor(props.node.type)}22`,
					color: typeBadgeColor(props.node.type),
				}}
			>
				{typeBadgeLabel(props.node.type)}
			</span>
			<span class={["tree-segment", { "is-group": isGroup(), "is-param": isParam() }]}>{label()}</span>
			<Show when={props.node.urlPath && props.node.type !== "segment"}>
				<span class="tree-url">{props.node.urlPath}</span>
			</Show>
			<Show when={props.node.filePath}>
				<span class="tree-path">{props.node.filePath}</span>
			</Show>
		</button>
	);
}

function flattenTree(
	nodes: RouteTreeNode[],
	search: string,
	parentPrefix: string,
): { node: RouteTreeNode; prefix: string }[] {
	const rows: { node: RouteTreeNode; prefix: string }[] = [];

	const filtered = search ? nodes.filter((n) => matchesSearch(n, search)) : nodes;

	for (let i = 0; i < filtered.length; i++) {
		const node = filtered[i];
		if (!node) continue;
		const isLast = i === filtered.length - 1;
		const connector = isLast ? "\u2514\u2500 " : "\u251C\u2500 ";
		const prefix = parentPrefix + connector;

		rows.push({ node, prefix });

		if (node.children.length > 0) {
			const childPrefix = parentPrefix + (isLast ? "   " : "\u2502  ");
			rows.push(...flattenTree(node.children, search, childPrefix));
		}
	}

	return rows;
}

function TreeTab(props: {
	search: string;
	tree: RouteTreeNode[];
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const rows = createMemo(() => {
		const result: { node: RouteTreeNode; prefix: string }[] = [];

		for (const root of props.tree) {
			result.push({ node: root, prefix: "" });
			if (root.children.length > 0) {
				result.push(...flattenTree(root.children, props.search, ""));
			}
		}

		return result;
	});

	return (
		<Show fallback={<div class="empty-state">No routes found</div>} when={rows().length > 0}>
			<VirtualList
				each={rows()}
				estimateHeight={22}
				render={(row) => <TreeRow node={row.node} prefix={row.prefix} />}
			/>
		</Show>
	);
}

function ListItem(props: {
	def: RouteDef;
	expanded: boolean;
	onClick: () => void;
	onOpenEditor: (f: string) => void;
	urlPath: string;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	return (
		<div
			class="list-item"
			onClick={() => props.onClick()}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					props.onClick();
				}
			}}
			role="button"
			tabindex={0}
		>
			<div class="list-item-header">
				<span class="list-item-url">{props.urlPath}</span>
				<div class="list-item-badges">
					<Show when={props.def.hasInput}>
						<span class="badge badge-yellow">INPUT</span>
					</Show>
					<Show when={props.def.authenticateMode === true}>
						<span class="badge badge-red">AUTH</span>
					</Show>
					<Show when={props.def.authenticateMode === "optional"}>
						<span class="badge badge-orange">AUTH?</span>
					</Show>
					<Show when={props.def.responseRoute}>
						<span class="badge badge-orange">RSP</span>
					</Show>
					<Show when={props.def.cache && Object.keys(props.def.cache).length > 0}>
						<span class="badge badge-cyan">CACHE</span>
					</Show>
				</div>
			</div>
			<button
				class="list-item-file"
				onClick={(e) => {
					e.stopPropagation();
					props.onOpenEditor(props.def.filePath);
				}}
				type="button"
			>
				{props.def.filePath}
			</button>
			<Show when={props.expanded}>
				<div class="list-item-detail">
					<div class="detail-row">
						<span class="detail-label">Virtual Path</span>
						<span class="detail-value">{props.def.virtualPath}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Export</span>
						<span class="detail-value">{props.def.exportName}</span>
					</div>
					<Show when={props.def.cache && Object.keys(props.def.cache).length > 0}>
						<div class="detail-row">
							<span class="detail-label">Cache</span>
							<span class="detail-value">{JSON.stringify(props.def.cache)}</span>
						</div>
					</Show>
					<Show when={props.def.intercept}>
						<div class="detail-row">
							<span class="detail-label">Intercept</span>
							<span class="detail-value">{JSON.stringify(props.def.intercept)}</span>
						</div>
					</Show>
				</div>
			</Show>
		</div>
	);
}

function TypedListTab(props: {
	defs: RouteDef[];
	onOpenEditor: (f: string) => void;
	search: string;
	type: RouteDef["type"];
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [expandedIdx, setExpandedIdx] = createSignal<number | null>(null);

	const filtered = createMemo(() => {
		let items = props.defs.filter((d) => d.type === props.type);
		if (props.search) {
			const term = props.search.toLowerCase();
			items = items.filter(
				(d) => d.filePath.toLowerCase().includes(term) || d.virtualPath.toLowerCase().includes(term),
			);
		}
		return items;
	});

	const urlPath = (vp: string): string => {
		const parts = vp.split("/");
		const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
		const urlParts: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] ?? "";
			if (rootIdx >= 0 && i <= rootIdx) continue;
			if (part.startsWith("(") && part.endsWith(")")) continue;
			if (part === "") continue;
			urlParts.push(part);
		}
		return `/${urlParts.join("/")}`;
	};

	return (
		<Show fallback={<div class="empty-state">No {props.type} routes found</div>} when={filtered().length > 0}>
			<VirtualList
				each={filtered()}
				estimateHeight={48}
				render={(def, idx) => (
					<ListItem
						def={def}
						expanded={expandedIdx() === idx}
						onClick={() => setExpandedIdx(expandedIdx() === idx ? null : idx)}
						onOpenEditor={props.onOpenEditor}
						urlPath={urlPath(def.virtualPath)}
					/>
				)}
			/>
		</Show>
	);
}

function ServerFnsTab(props: {
	fns: ServerFnInfo[];
	onOpenEditor: (f: string) => void;
	search: string;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [sortCol, setSortCol] = createSignal(loadState().sortCol);
	const [sortDir, setSortDir] = createSignal<"asc" | "desc">(loadState().sortDir);

	const handleSort = (col: string) => {
		if (sortCol() === col) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortCol(col);
			setSortDir("asc");
		}
	};

	const filtered = createMemo(() => {
		let items = [...props.fns];
		if (props.search) {
			const term = props.search.toLowerCase();
			items = items.filter(
				(f) =>
					f.name.toLowerCase().includes(term) ||
					f.file.toLowerCase().includes(term) ||
					f.method.toLowerCase().includes(term),
			);
		}
		const col = sortCol();
		const dir = sortDir();
		const getValue = (fn: ServerFnInfo): string => {
			switch (col) {
				case "name":
					return fn.name;
				case "method":
					return fn.method;
				case "authenticate":
					return String(fn.authenticate);
				case "stream":
					return String(fn.stream);
				case "file":
					return fn.file;
				default:
					return fn.name;
			}
		};
		items.sort((a, b) => {
			const cmp = getValue(a).localeCompare(getValue(b));
			return dir === "asc" ? cmp : -cmp;
		});
		return items;
	});

	const sortIndicator = (col: string) => {
		if (sortCol() !== col) return "";
		return sortArrow(sortDir());
	};

	return (
		<Show fallback={<div class="empty-state">No server functions found</div>} when={filtered().length > 0}>
			<div class="fn-table-wrap">
				<table class="fn-table">
					<thead>
						<tr>
							<th class={{ sorted: sortCol() === "name" }} onClick={() => handleSort("name")}>
								Name{sortIndicator("name")}
							</th>
							<th class={{ sorted: sortCol() === "method" }} onClick={() => handleSort("method")}>
								Method{sortIndicator("method")}
							</th>
							<th class={{ sorted: sortCol() === "authenticate" }} onClick={() => handleSort("authenticate")}>
								Auth{sortIndicator("authenticate")}
							</th>
							<th class={{ sorted: sortCol() === "stream" }} onClick={() => handleSort("stream")}>
								Stream{sortIndicator("stream")}
							</th>
							<th>File</th>
						</tr>
					</thead>
					<tbody>
						<For each={filtered()}>
							{(fn) => (
								<tr>
									<td>{fn.name}</td>
									<td>
										<span class={`method-badge method-${fn.method}`}>{fn.method}</span>
									</td>
									<td>{fn.authenticate ? "\u2713" : "\u2013"}</td>
									<td>{fn.stream ? "\u2713" : "\u2013"}</td>
									<td>
										<button class="file-link" onClick={() => props.onOpenEditor(fn.file)} type="button">
											{fn.file}
										</button>
									</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</Show>
	);
}

function methodCategory(m: string): string {
	switch (m) {
		case "authenticate":
		case "authenticateOptional":
		case "authorize":
			return "is-auth";
		case "loader":
		case "preloader":
		case "effects":
		case "input":
			return "is-data";
		case "cache":
			return "is-cache";
		case "render":
		case "response":
			return "is-render";
		case "head":
		case "headers":
			return "is-head";
		case "errorRender":
		case "notFoundRender":
		case "unauthenticatedRender":
		case "unauthorizedRender":
			return "is-error";
		default:
			return "";
	}
}

function shortMethod(m: string): string {
	switch (m) {
		case "authenticateOptional":
			return "auth?";
		case "authenticate":
			return "auth";
		case "unauthenticatedRender":
			return "401";
		case "unauthorizedRender":
			return "403";
		case "notFoundRender":
			return "404";
		case "errorRender":
			return "error";
		default:
			return m;
	}
}

function safeStringify(val: unknown, indent?: number): string {
	try {
		return JSON.stringify(val, null, indent);
	} catch {
		return String(val);
	}
}

function ChainNode(props: {
	builderChains: Record<string, string[]>;
	headConfig?: Record<string, unknown>;
	node: RouteTreeNode;
	runtimeMatch?: RuntimeMatch;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [expanded, setExpanded] = createSignal(false);
	const methods = () => (props.node.filePath ? (props.builderChains[props.node.filePath] ?? []) : []);
	const isGroup = () => props.node.segment.startsWith("(") && props.node.segment.endsWith(")");
	const isParam = () => props.node.segment.startsWith("[") && props.node.segment.endsWith("]");
	const hasDetails = () =>
		props.node.auth !== false ||
		(props.node.cache && Object.keys(props.node.cache).length > 0) ||
		props.node.hasInput ||
		props.node.intercept ||
		props.node.responseRoute ||
		props.runtimeMatch?.loaderData !== undefined ||
		props.runtimeMatch?.preloaderContext !== undefined ||
		props.headConfig !== undefined;

	return (
		<div
			class="cur-chain-node"
			onClick={() => setExpanded((e) => !e)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					setExpanded((v) => !v);
				}
			}}
			role="button"
			tabindex={0}
		>
			<div class="cur-chain-header">
				<span
					class="tree-badge"
					style={{
						background: `${typeBadgeColor(props.node.type)}22`,
						color: typeBadgeColor(props.node.type),
					}}
				>
					{typeBadgeLabel(props.node.type)}
				</span>
				<span class={["cur-chain-seg", { "is-group": isGroup(), "is-param": isParam() }]}>
					{props.node.segment || "/"}
				</span>
				<Show when={props.node.filePath}>
					<button
						class="cur-chain-file"
						onClick={(e) => {
							e.stopPropagation();
							openEditor(props.node.filePath ?? "");
						}}
						type="button"
					>
						{props.node.filePath}
					</button>
				</Show>
			</div>
			<Show when={methods().length > 0}>
				<div class="cur-chain-methods">
					<For each={methods()}>{(m) => <span class={`cur-method ${methodCategory(m)}`}>{shortMethod(m)}</span>}</For>
				</div>
			</Show>
			<Show when={expanded() && hasDetails()}>
				<div class="cur-chain-config">
					<Show when={props.node.virtualPath}>
						<div class="cur-config-row">
							<span class="cur-config-key">virtual</span>
							<span class="cur-config-val">{props.node.virtualPath}</span>
						</div>
					</Show>
					<Show when={props.node.urlPath && props.node.type !== "segment"}>
						<div class="cur-config-row">
							<span class="cur-config-key">variable</span>
							<span class="cur-config-val">{props.node.urlPath}</span>
						</div>
					</Show>
					<Show when={props.node.auth !== false}>
						<div class="cur-config-row">
							<span class="cur-config-key">auth</span>
							<span class="cur-config-val">{String(props.node.auth)}</span>
						</div>
					</Show>
					<Show when={props.node.cache && Object.keys(props.node.cache).length > 0}>
						<div class="cur-config-row">
							<span class="cur-config-key">cache</span>
							<span class="cur-config-val">{safeStringify(props.node.cache)}</span>
						</div>
					</Show>
					<Show when={props.node.hasInput}>
						<div class="cur-config-row">
							<span class="cur-config-key">input</span>
							<span class="cur-config-val">true</span>
						</div>
					</Show>
					<Show when={props.node.intercept}>
						<div class="cur-config-row">
							<span class="cur-config-key">intercept</span>
							<span class="cur-config-val">{safeStringify(props.node.intercept)}</span>
						</div>
					</Show>
					<Show when={props.node.responseRoute}>
						<div class="cur-config-row">
							<span class="cur-config-key">response</span>
							<span class="cur-config-val">true</span>
						</div>
					</Show>
					<Show when={props.runtimeMatch?.preloaderContext !== undefined}>
						<div class="cur-config-row">
							<span class="cur-config-key">preloader</span>
							<pre class="cur-config-pre">{safeStringify(props.runtimeMatch?.preloaderContext, 2)}</pre>
						</div>
					</Show>
					<Show when={props.runtimeMatch?.loaderData !== undefined}>
						<div class="cur-config-row">
							<span class="cur-config-key">loader</span>
							<pre class="cur-config-pre">{safeStringify(props.runtimeMatch?.loaderData, 2)}</pre>
						</div>
					</Show>
					<Show when={props.headConfig !== undefined}>
						<div class="cur-config-row">
							<span class="cur-config-key">head</span>
							<pre class="cur-config-pre">{safeStringify(props.headConfig, 2)}</pre>
						</div>
					</Show>
				</div>
			</Show>
		</div>
	);
}

function parseSearchParams(search: string): [string, string][] {
	if (!search || search === "?") return [];
	const params = new URLSearchParams(search);
	const result: [string, string][] = [];
	for (const [k, v] of params) {
		result.push([k, v]);
	}
	return result;
}

function formatAge(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

function CurrentTab(props: {
	builderChains: Record<string, string[]>;
	defs: RouteDef[];
	localeMatch?: LocaleMatch;
	tree: RouteTreeNode[];
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [url, setUrl] = createSignal({
		hash: window.location.hash,
		pathname: window.location.pathname,
		search: window.location.search,
	});
	const [htmlAttrs, setHtmlAttrs] = createSignal({
		dir: document.documentElement.getAttribute("dir") ?? "ltr",
		lang: document.documentElement.getAttribute("lang") ?? "",
		theme: document.documentElement.getAttribute("data-theme") ?? "",
	});
	const [docTitle, setDocTitle] = createSignal(document.title);

	/* Watch URL changes */
	createEffect(
		() => undefined,
		() => {
			const update = () => {
				setUrl({
					hash: window.location.hash,
					pathname: window.location.pathname,
					search: window.location.search,
				});
				setDocTitle(document.title);
			};

			window.addEventListener("popstate", update);

			const origPush = history.pushState.bind(history);
			const origReplace = history.replaceState.bind(history);
			history.pushState = (...args: Parameters<typeof history.pushState>) => {
				origPush(...args);
				update();
			};
			history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
				origReplace(...args);
				update();
			};

			return () => {
				window.removeEventListener("popstate", update);
				history.pushState = origPush;
				history.replaceState = origReplace;
			};
		},
	);

	/* Watch <html> attributes + title */
	createEffect(
		() => undefined,
		() => {
			const observer = new MutationObserver(() => {
				setHtmlAttrs({
					dir: document.documentElement.getAttribute("dir") ?? "ltr",
					lang: document.documentElement.getAttribute("lang") ?? "",
					theme: document.documentElement.getAttribute("data-theme") ?? "",
				});
			});
			observer.observe(document.documentElement, {
				attributeFilter: ["data-theme", "dir", "lang"],
				attributes: true,
			});

			const titleObs = new MutationObserver(() => setDocTitle(document.title));
			const titleEl = document.querySelector("title");
			if (titleEl) {
				titleObs.observe(titleEl, { characterData: true, childList: true, subtree: true });
			}

			return () => {
				observer.disconnect();
				titleObs.disconnect();
			};
		},
	);

	const matched = createMemo(() => matchRouteTree(props.tree, url().pathname, props.localeMatch));
	const searchParams = createMemo(() => parseSearchParams(url().search));

	/* Read runtime matches (loader data, preloader context) + cache (headConfig) */
	const [runtimeMatches, setRuntimeMatches] = createSignal<RuntimeMatch[]>([]);
	const [cachedMatches, setCachedMatches] = createSignal<CachedMatchInfo[]>([]);

	createEffect(
		() => url(),
		() => {
			const read = () => {
				const matches = window.__flare_devtools_matches__;
				if (matches) setRuntimeMatches(matches);
				const cache = window.__flare_devtools_cache__;
				if (cache) setCachedMatches(cache);
			};
			read();
			const timer = setTimeout(read, 100);
			return () => clearTimeout(timer);
		},
	);

	const runtimeMatchFor = (node: RouteTreeNode): RuntimeMatch | undefined => {
		if (!node.virtualPath) return undefined;
		return runtimeMatches().find((m) => m.virtualPath === node.virtualPath);
	};

	const headConfigFor = (node: RouteTreeNode): Record<string, unknown> | undefined => {
		if (!node.virtualPath) return undefined;
		const cached = cachedMatches().find((c) => c.matchId.startsWith(`${node.virtualPath}:`));
		return cached?.headConfig;
	};

	const currentCacheEntries = createMemo(() => {
		const chain = matched().chain;
		const vPaths = new Set(chain.map((m) => m.node.virtualPath).filter((vp): vp is string => vp !== null));
		const stats = window.__flare_devtools_actions__?.getCacheStats();
		if (!stats) return [];
		return stats.entries.filter((e) => {
			for (const vp of vPaths) {
				if (e.matchId.startsWith(vp)) return true;
			}
			return false;
		});
	});

	/* Read resolved <head> tags from DOM */
	const [headTags, setHeadTags] = createSignal<{ attrs: Record<string, string>; tag: string }[]>([]);

	const readHeadTags = () => {
		const tags: { attrs: Record<string, string>; tag: string }[] = [];
		const head = document.head;
		for (const el of head.querySelectorAll("meta, link[rel]")) {
			const attrs: Record<string, string> = {};
			for (const attr of el.attributes) {
				attrs[attr.name] = attr.value;
			}
			tags.push({ attrs, tag: el.tagName.toLowerCase() });
		}
		setHeadTags(tags);
	};

	createEffect(
		() => url(),
		() => {
			readHeadTags();
			const timer = setTimeout(readHeadTags, 200);
			return () => clearTimeout(timer);
		},
	);

	const leafMatch = createMemo(() => {
		const chain = matched().chain;
		for (let i = chain.length - 1; i >= 0; i--) {
			const node = chain[i]?.node;
			if (node?.virtualPath && node.type !== "segment") return node;
		}
		return null;
	});

	return (
		<div class="cur-grid">
			{/* URL + paths */}
			<div class="cur-section">
				<div class="cur-path-rows">
					<div class="cur-path-row">
						<span class="cur-path-label">path</span>
						<span class="cur-path-value">
							{url().pathname}
							<Show when={url().search}>
								<span class="cur-url-search">{url().search}</span>
							</Show>
							<Show when={url().hash}>
								<span class="cur-url-hash">{url().hash}</span>
							</Show>
						</span>
					</div>
					<Show when={leafMatch()}>
						{(leaf) => (
							<>
								<div class="cur-path-row">
									<span class="cur-path-label">virtual</span>
									<span class="cur-path-value">{leaf().virtualPath}</span>
								</div>
								<div class="cur-path-row">
									<span class="cur-path-label">variable</span>
									<span class="cur-path-value">{leaf().urlPath}</span>
								</div>
							</>
						)}
					</Show>
				</div>
			</div>

			{/* Search params */}
			<Show when={searchParams().length > 0}>
				<div class="cur-section">
					<div class="cur-label">Search Params</div>
					<div class="cur-params">
						<For each={searchParams()}>
							{([k, v]) => (
								<span>
									<span class="cur-param-key">{k}</span>
									<span class="cur-param-val">{v}</span>
								</span>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Route chain with builder methods */}
			<div class="cur-section">
				<div class="cur-label">Route Chain</div>
				<Show
					fallback={<div style={{ color: "#52525b", "font-size": "10px" }}>No matching route</div>}
					when={matched().chain.length > 0}
				>
					<div class="cur-chain">
						<For each={matched().chain}>
							{(match, idx) => (
								<>
									<Show when={idx() > 0}>
										<div class="cur-chain-arrow">{"\u2193"}</div>
									</Show>
									<ChainNode
										builderChains={props.builderChains}
										headConfig={headConfigFor(match.node)}
										node={match.node}
										runtimeMatch={runtimeMatchFor(match.node)}
									/>
								</>
							)}
						</For>
					</div>
				</Show>
			</div>

			{/* Route params */}
			<Show when={Object.keys(matched().params).length > 0}>
				<div class="cur-section">
					<div class="cur-label">Route Params</div>
					<div class="cur-params">
						<For each={Object.entries(matched().params)}>
							{([k, v]) => (
								<span>
									<span class="cur-param-key">{k}</span>
									<span class="cur-param-val">{v}</span>
								</span>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Head tags */}
			<Show when={headTags().length > 0}>
				<div class="cur-section">
					<div class="cur-label">Head Tags</div>
					<div class="cur-head-tags">
						<For each={headTags()}>
							{(tag) => (
								<div class="cur-head-tag">
									<span class="cur-head-tag-name">{`<${tag.tag}`}</span>
									<For each={Object.entries(tag.attrs)}>
										{([k, v]) => (
											<span class="cur-head-attr">
												{" "}
												<span class="cur-head-attr-key">{k}</span>
												{v ? (
													<>
														=<span class="cur-head-attr-val">"{v}"</span>
													</>
												) : null}
											</span>
										)}
									</For>
									<span class="cur-head-tag-name">{" />"}</span>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Document & State */}
			<div class="cur-section">
				<div class="cur-label">Document</div>
				<div class="cur-meta">
					<div class="cur-meta-item">
						<span class="cur-meta-key">title</span>
						<span class="cur-meta-val">{docTitle() || "\u2013"}</span>
					</div>
					<div class="cur-meta-item">
						<span class="cur-meta-key">theme</span>
						<span class="cur-meta-val">{htmlAttrs().theme || "\u2013"}</span>
					</div>
					<div class="cur-meta-item">
						<span class="cur-meta-key">dir</span>
						<span class="cur-meta-val">{htmlAttrs().dir}</span>
					</div>
					<div class="cur-meta-item">
						<span class="cur-meta-key">lang</span>
						<span class="cur-meta-val">{htmlAttrs().lang || "\u2013"}</span>
					</div>
				</div>
			</div>

			{/* Route Cache */}
			<Show when={currentCacheEntries().length > 0}>
				<div class="cur-section">
					<div class="cur-label">Route Cache</div>
					<div class="act-row" style={{ "margin-bottom": "6px" }}>
						<button
							class="act-btn"
							onClick={() => {
								const a = window.__flare_devtools_actions__;
								if (a) {
									a.invalidate({ revalidate: true });
								}
							}}
							type="button"
						>
							Refetch Current
						</button>
						<For each={currentCacheEntries()}>
							{(entry) => (
								<div class="act-stat">
									<span class="act-stat-key">{entry.matchId}</span>
									<span class="act-cache-age">{formatAge(entry.age)}</span>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Error Simulation */}
			<div class="cur-section">
				<div class="cur-label">Simulate Error</div>
				<div class="act-row">
					<button
						class="act-btn is-danger"
						onClick={() => {
							const err = new Error("Simulated unauthenticated");
							Object.defineProperty(err, "name", { value: "UnauthenticatedError" });
							Object.defineProperty(err, "status", { value: 401 });
							window.__flare_devtools_actions__?.setError(err);
						}}
						type="button"
					>
						401
					</button>
					<button
						class="act-btn is-danger"
						onClick={() => {
							const err = new Error("Simulated unauthorized");
							Object.defineProperty(err, "name", { value: "UnauthorizedError" });
							Object.defineProperty(err, "status", { value: 403 });
							window.__flare_devtools_actions__?.setError(err);
						}}
						type="button"
					>
						403
					</button>
					<button
						class="act-btn is-danger"
						onClick={() => window.__flare_devtools_actions__?.setNotFound(true)}
						type="button"
					>
						404
					</button>
					<button
						class="act-btn is-danger"
						onClick={() => {
							const err = new Error("Simulated validation error");
							Object.defineProperty(err, "name", { value: "ServerFnValidationError" });
							Object.defineProperty(err, "status", { value: 400 });
							Object.defineProperty(err, "errors", {
								value: { fieldErrors: {}, formErrors: ["Simulated validation error"] },
							});
							window.__flare_devtools_actions__?.setError(err);
						}}
						type="button"
					>
						400
					</button>
					<button
						class="act-btn is-danger"
						onClick={() => window.__flare_devtools_actions__?.setError(new Error("Simulated error"))}
						type="button"
					>
						500
					</button>
					<button
						class="act-btn"
						onClick={() => {
							window.__flare_devtools_actions__?.setNotFound(false);
							window.__flare_devtools_actions__?.clearError();
						}}
						type="button"
					>
						Reset
					</button>
				</div>
			</div>
		</div>
	);
}

/* ── Actions tab ──────────────────────────────────────────────────────── */

function CopyButton(props: {
	getData: () => unknown;
	label: string;
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [copied, setCopied] = createSignal(false);

	const handleCopy = () => {
		const text = JSON.stringify(props.getData(), null, 2);
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	};

	return (
		<button class={["act-btn", { "is-copied": copied() }]} onClick={handleCopy} type="button">
			{copied() ? "Copied" : props.label}
		</button>
	);
}

function extractParams(virtualPath: string): string[] {
	const params: string[] = [];
	const re = /\[([^\]]+)\]/g;
	let m = re.exec(virtualPath);
	while (m) {
		const name = m[1] ?? "";
		if (name.startsWith("...")) {
			params.push(name.slice(3));
		} else {
			params.push(name);
		}
		m = re.exec(virtualPath);
	}
	return params;
}

function ActionsTab(props: {
	defs: RouteDef[];
	matched: { chain: MatchedRoute[]; params: Record<string, string> };
	serverFns: ServerFnInfo[];
	tree: RouteTreeNode[];
}): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const actions = () => window.__flare_devtools_actions__;
	const [cacheStats, setCacheStats] = createSignal<{
		entries: { age: number; matchId: string }[];
		matchCount: number;
		prefetchCount: number;
	}>({ entries: [], matchCount: 0, prefetchCount: 0 });

	const refreshStats = () => {
		const a = actions();
		if (a) setCacheStats(a.getCacheStats());
	};

	createEffect(
		() => undefined,
		() => {
			refreshStats();
			const timer = setInterval(refreshStats, 2000);
			return () => clearInterval(timer);
		},
	);

	/* Navigate section */
	const pageRoutes = createMemo(() =>
		props.defs.filter((d) => d.type === "page").sort((a, b) => a.virtualPath.localeCompare(b.virtualPath)),
	);
	const [selectedRoute, setSelectedRoute] = createSignal("");
	const selectedParams = createMemo(() => {
		const vp = selectedRoute();
		if (!vp) return [];
		return extractParams(vp);
	});
	const [paramValues, setParamValues] = createSignal<Record<string, string>>({});
	const [useReplace, setUseReplace] = createSignal(false);

	const resolveUrl = (): string => {
		const vp = selectedRoute();
		if (!vp) return "/";
		const parts = vp.split("/");
		const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
		const urlParts: string[] = [];
		const pv = paramValues();
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] ?? "";
			if (rootIdx >= 0 && i <= rootIdx) continue;
			if (part.startsWith("(") && part.endsWith(")")) continue;
			if (part === "") continue;
			if (part.startsWith("[[...") && part.endsWith("]]")) {
				const name = part.slice(5, -2);
				const val = pv[name];
				if (val) urlParts.push(val);
			} else if (part.startsWith("[...") && part.endsWith("]")) {
				const name = part.slice(4, -1);
				urlParts.push(pv[name] ?? "");
			} else if (part.startsWith("[") && part.endsWith("]")) {
				const name = part.slice(1, -1);
				urlParts.push(pv[name] ?? "");
			} else {
				urlParts.push(part);
			}
		}
		return `/${urlParts.join("/")}`;
	};

	/* Document state */
	const [docState, setDocState] = createSignal({
		dir: document.documentElement.getAttribute("dir") ?? "ltr",
		lang: document.documentElement.getAttribute("lang") ?? "",
		theme: document.documentElement.getAttribute("data-theme") ?? "",
	});

	const refreshDocState = () => {
		setDocState({
			dir: document.documentElement.getAttribute("dir") ?? "ltr",
			lang: document.documentElement.getAttribute("lang") ?? "",
			theme: document.documentElement.getAttribute("data-theme") ?? "",
		});
	};

	return (
		<div class="content">
			<div class="act-grid">
				{/* Cache */}
				<div class="act-section">
					<div class="act-label">Cache</div>
					<div class="act-row" style={{ "margin-bottom": "8px" }}>
						<div class="act-stat">
							<span class="act-stat-key">match</span>
							<span class="act-stat-val">{cacheStats().matchCount}</span>
						</div>
						<div class="act-stat">
							<span class="act-stat-key">prefetch</span>
							<span class="act-stat-val">{cacheStats().prefetchCount}</span>
						</div>
					</div>
					<div class="act-row">
						<button
							class="act-btn"
							onClick={() => {
								actions()?.invalidate();
								refreshStats();
							}}
							type="button"
						>
							Invalidate All
						</button>
						<button
							class="act-btn"
							onClick={() => {
								actions()?.clearPrefetchCache();
								refreshStats();
							}}
							type="button"
						>
							Clear Prefetch
						</button>
						<button
							class="act-btn"
							onClick={() => {
								actions()?.invalidate({ revalidate: true });
								refreshStats();
							}}
							type="button"
						>
							Force Refetch
						</button>
					</div>
					<Show when={cacheStats().entries.length > 0}>
						<div class="act-cache-list">
							<For each={cacheStats().entries}>
								{(entry) => (
									<div class="act-cache-entry">
										<span class="act-cache-id">{entry.matchId}</span>
										<span class="act-cache-age">{formatAge(entry.age)}</span>
									</div>
								)}
							</For>
						</div>
					</Show>
				</div>

				{/* Navigate */}
				<div class="act-section">
					<div class="act-label">Navigate</div>
					<div class="act-row" style={{ "margin-bottom": "6px" }}>
						<select
							class="act-select"
							onChange={(e) => {
								setSelectedRoute(e.currentTarget.value);
								setParamValues({});
							}}
							value={selectedRoute()}
						>
							<option value="">Select route...</option>
							<For each={pageRoutes()}>{(def) => <option value={def.virtualPath}>{def.virtualPath}</option>}</For>
						</select>
					</div>
					<Show when={selectedParams().length > 0}>
						<div
							style={{
								display: "flex",
								"flex-direction": "column",
								gap: "4px",
								"margin-bottom": "6px",
							}}
						>
							<For each={selectedParams()}>
								{(param) => (
									<div class="act-param-row">
										<span class="act-param-label">{param}</span>
										<input
											class="act-input"
											onInput={(e) => {
												setParamValues((prev) => ({
													...prev,
													[param]: e.currentTarget.value,
												}));
											}}
											placeholder={param}
											value={paramValues()[param] ?? ""}
										/>
									</div>
								)}
							</For>
						</div>
					</Show>
					<div class="act-row">
						<button
							class="act-btn"
							onClick={() => {
								const url = resolveUrl();
								if (url) actions()?.navigate({ replace: useReplace(), to: url });
							}}
							type="button"
						>
							Go
						</button>
						<button
							class="act-btn"
							onClick={() => {
								const url = resolveUrl();
								if (url) actions()?.prefetch({ to: url });
							}}
							type="button"
						>
							Prefetch
						</button>
						<button class="act-btn" onClick={() => history.back()} type="button">
							Back
						</button>
						<button class="act-btn" onClick={() => history.forward()} type="button">
							Forward
						</button>
						<button
							class={["act-btn", { "is-copied": useReplace() }]}
							onClick={() => setUseReplace((r) => !r)}
							style={useReplace() ? { "border-color": "#3b82f6", color: "#3b82f6" } : {}}
							type="button"
						>
							{useReplace() ? "Replace" : "Push"}
						</button>
					</div>
				</div>

				{/* Document */}
				<div class="act-section">
					<div class="act-label">Document</div>
					<div class="act-doc-row">
						<span class="act-doc-key">theme</span>
						<span class="act-doc-val">{docState().theme || "(none)"}</span>
						<button
							class="act-btn"
							onClick={() => {
								const current = document.documentElement.getAttribute("data-theme") ?? "";
								let next = "";
								if (current === "") next = "light";
								else if (current === "light") next = "dark";
								if (next) {
									document.documentElement.setAttribute("data-theme", next);
								} else {
									document.documentElement.removeAttribute("data-theme");
								}
								refreshDocState();
							}}
							type="button"
						>
							Cycle
						</button>
					</div>
					<div class="act-doc-row">
						<span class="act-doc-key">dir</span>
						<span class="act-doc-val">{docState().dir}</span>
						<button
							class="act-btn"
							onClick={() => {
								const next = document.documentElement.getAttribute("dir") === "rtl" ? "ltr" : "rtl";
								document.documentElement.setAttribute("dir", next);
								refreshDocState();
							}}
							type="button"
						>
							Toggle
						</button>
					</div>
					<div class="act-doc-row">
						<span class="act-doc-key">lang</span>
						<input
							class="act-input"
							onInput={(e) => {
								document.documentElement.setAttribute("lang", e.currentTarget.value);
								refreshDocState();
							}}
							placeholder="en"
							value={docState().lang}
						/>
					</div>
				</div>

				{/* Export */}
				<div class="act-section">
					<div class="act-label">Export</div>
					<div class="act-row">
						<CopyButton
							getData={() => ({
								chain: props.matched.chain.map((m) => ({
									segment: m.node.segment,
									type: m.node.type,
									virtualPath: m.node.virtualPath,
								})),
								params: props.matched.params,
							})}
							label="Route Chain"
						/>
						<CopyButton getData={() => props.matched.params} label="Params" />
						<CopyButton getData={() => props.tree} label="Route Tree" />
						<CopyButton getData={() => props.defs} label="All Defs" />
						<CopyButton getData={() => props.serverFns} label="Server Fns" />
						<CopyButton getData={() => cacheStats().entries} label="Cache" />
					</div>
				</div>
			</div>
		</div>
	);
}

/* ── DevTools root ────────────────────────────────────────────────────── */

function DevTools(): ReturnType<(typeof import("solid-js"))["createComponent"]> {
	const [isOpen, setIsOpen] = createSignal(false);
	const [activeTab, setActiveTab] = createSignal<TabId>(loadState().activeTab);
	const [search, setSearch] = createSignal("");
	const [data, setData] = createSignal<ApiData | null>(null);

	let searchRef: HTMLInputElement | null = null;

	/* Fetch data on open */
	createEffect(isOpen, (open) => {
		if (open) {
			fetch("/__flare/api")
				.then((r) => r.json())
				.then((d) => setData(d as ApiData));
		}
	});

	/* Persist state */
	createEffect(activeTab, (tab) => {
		saveState({
			activeTab: tab,
			expandedNodes: [],
			sortCol: "name",
			sortDir: "asc",
		});
	});

	/* Keyboard shortcuts */
	createEffect(
		() => undefined,
		() => {
			const handler = (e: KeyboardEvent) => {
				if (e.ctrlKey && e.shiftKey && e.key === "D") {
					e.preventDefault();
					setIsOpen((o) => !o);
				}
				if (e.key === "Escape" && isOpen()) {
					setIsOpen(false);
				}
				if (e.key === "/" && isOpen() && document.activeElement !== searchRef) {
					e.preventDefault();
					searchRef?.focus();
				}
			};
			window.addEventListener("keydown", handler);
			return () => window.removeEventListener("keydown", handler);
		},
	);

	const tabCount = (tabId: TabId): number | null => {
		const d = data();
		if (!d) return null;
		if (tabId === "tree") return d.routeTree.length;
		if (tabId === "server-fns") return d.serverFunctions.length;
		if (tabId === "current") return null;
		const defType = TAB_TO_DEF_TYPE[tabId];
		if (defType) return d.defs.filter((def) => def.type === defType).length;
		return null;
	};

	return (
		<>
			<button
				class={["toggle-btn", { "is-open": isOpen() }]}
				onClick={() => setIsOpen((o) => !o)}
				title="Flare DevTools (Ctrl+Shift+D)"
				type="button"
			>
				F
			</button>

			<Show when={isOpen()}>
				<div
					class="overlay"
					onClick={(e) => {
						if (e.target === e.currentTarget) setIsOpen(false);
					}}
				>
					<div class="modal">
						{/* Header */}
						<div class="header">
							<div class="tab-bar">
								<For each={TABS}>
									{(tab) => (
										<button
											class={["tab-btn", { active: activeTab() === tab.id }]}
											onClick={() => {
												setActiveTab(tab.id);
												setSearch("");
											}}
											type="button"
										>
											{tab.label}
											<Show when={tabCount(tab.id) !== null}>
												<span class="tab-count">{tabCount(tab.id)}</span>
											</Show>
										</button>
									)}
								</For>
							</div>
							<button class="close-btn" onClick={() => setIsOpen(false)} type="button">
								{"\u00D7"}
							</button>
						</div>

						{/* Toolbar */}
						<Show when={activeTab() !== "current" && activeTab() !== "actions"}>
							<div class="toolbar">
								<input
									class="search-input"
									onInput={(e) => setSearch(e.currentTarget.value)}
									placeholder={`Search ${activeTab()}... (press / to focus)`}
									ref={(el) => {
										searchRef = el;
									}}
									value={search()}
								/>
							</div>
						</Show>

						{/* Content */}
						<Show
							fallback={
								<div class="content">
									<div class="empty-state">Loading...</div>
								</div>
							}
							when={data()}
						>
							{(d) => (
								<Switch>
									<Match when={activeTab() === "tree"}>
										<TreeTab search={search()} tree={d().routeTree} />
									</Match>
									<Match when={activeTab() === "pages"}>
										<TypedListTab defs={d().defs} onOpenEditor={openEditor} search={search()} type="page" />
									</Match>
									<Match when={activeTab() === "layouts"}>
										<TypedListTab defs={d().defs} onOpenEditor={openEditor} search={search()} type="layout" />
									</Match>
									<Match when={activeTab() === "root-layouts"}>
										<TypedListTab defs={d().defs} onOpenEditor={openEditor} search={search()} type="root-layout" />
									</Match>
									<Match when={activeTab() === "segments"}>
										<TypedListTab defs={d().defs} onOpenEditor={openEditor} search={search()} type="path-segment" />
									</Match>
									<Match when={activeTab() === "server-fns"}>
										<div class="content">
											<ServerFnsTab fns={d().serverFunctions} onOpenEditor={openEditor} search={search()} />
										</div>
									</Match>
									<Match when={activeTab() === "current"}>
										<div class="content">
											<CurrentTab
												builderChains={d().builderChains}
												defs={d().defs}
												localeMatch={d().localeMatch}
												tree={d().routeTree}
											/>
										</div>
									</Match>
									<Match when={activeTab() === "actions"}>
										<ActionsTab
											defs={d().defs}
											matched={matchRouteTree(d().routeTree, window.location.pathname, d().localeMatch)}
											serverFns={d().serverFunctions}
											tree={d().routeTree}
										/>
									</Match>
								</Switch>
							)}
						</Show>

						{/* Status bar */}
						<div class="status-bar">
							<span>Ctrl+Shift+D toggle</span>
							<span>Esc close</span>
							<span>/ search</span>
						</div>
					</div>
				</div>
			</Show>
		</>
	);
}

/* ── Mount ────────────────────────────────────────────────────────────── */

export function mount(): void {
	if (typeof window === "undefined") return;

	const host = document.createElement("div");
	host.id = "__flare-devtools-host";
	const shadow = host.attachShadow({ mode: "open" });

	const style = document.createElement("style");
	style.textContent = CSS;
	shadow.appendChild(style);

	document.body.appendChild(host);
	render(() => <DevTools />, shadow);
}
