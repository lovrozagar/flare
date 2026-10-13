// Oxlint registers one plugin name. This module publishes every flare rule.
import { rule as noModuleSideEffects } from "./no-module-side-effects.js";
import { rule as noModuleState } from "./no-module-state.js";
import { rule as funnelOnly } from "./funnel-only.js";
import { rule as noFlareHeaderBranching } from "./no-flare-header-branching.js";
import { rule as locationOnlyInRedirect } from "./location-only-in-redirect.js";
import { rule as noV8Ignore } from "./no-v8-ignore.js";
import { rule as pathPrefix } from "./path-prefix.js";

const PERMIT = new Set([
	"shared>shared",
	"client>client",
	"client>shared",
	"server>server",
	"server>shared",
	"adapters>adapters",
	"vite>vite",
	// vite/ runs in Node (00-rules environments).
	"vite>node",
	"adapters>shared",
	"adapters>server",
	"vite>shared",
	"testing>shared",
	"testing>client",
	"testing>server",
	"exports>shared",
	"exports>client",
	"exports>server",
	"exports>adapters",
	"exports>vite",
	"exports>testing",
]);

const FEATURE_SIDES = {
	shared: new Set(["shared"]),
	client: new Set(["shared", "client"]),
	server: new Set(["shared", "server"]),
	// A feature's vite side runs in Node, as vite/ does (00-rules environments).
	vite: new Set(["shared", "vite", "node"]),
};

function srcRel(filename) {
	const index = filename.lastIndexOf("/src/");
	if (index === -1) return null;
	return filename.slice(index + "/src/".length);
}

function bucket(rel) {
	const feature = /^features\/([^/]+)\/(shared|client|server|vite)\//.exec(rel);
	if (feature) return `f:${feature[1]}:${feature[2]}`;
	return rel.split("/")[0];
}

function resolveRel(fromRel, spec) {
	const dir = fromRel.split("/").slice(0, -1);
	for (const part of spec.split("/")) {
		if (part === ".") continue;
		if (part === "..") dir.pop();
		else dir.push(part);
	}
	return dir.join("/");
}

function target(fromRel, spec) {
	if (spec.startsWith("node:")) return "node";
	if (spec.startsWith(".")) return bucket(resolveRel(fromRel, spec));
	return "pkg";
}

function featureOf(bucketName) {
	if (!bucketName.startsWith("f:")) return null;
	return bucketName.split(":")[1];
}

function sideOf(bucketName) {
	return bucketName.split(":")[2];
}

// An adapter may use its own runtime's builtins (00-rules environments). The filesystem store is Node's.
const NODE_ADAPTERS = ["adapters/node/", "adapters/stores/fs/"];

// The dev handler hosts the app server through the Node bridge an app uses (00-rules). No other vite file may.
function devHost(fromRel, spec) {
	return (
		fromRel.startsWith("vite/dev/") && spec.startsWith(".") && resolveRel(fromRel, spec).startsWith("adapters/node/")
	);
}

// The three providers that tell other tabs may import the channel through its index (00-rules).
const SYNC_IMPORTERS = new Set([
	"features/theme/shared/provider.tsx",
	"features/direction/shared/provider.tsx",
	"features/i18n/shared/provider.tsx",
]);

function syncImport(fromRel, spec) {
	return SYNC_IMPORTERS.has(fromRel) && spec.startsWith(".") && resolveRel(fromRel, spec) === "client/sync/index.ts";
}

// The font generator runs in Node at authoring time (bits/14): builtins, and its own feature's shared side. The
// registry is the fonts feature's data: its vite side reads it for the build-time copy, and no other feature does.
function fontGenerator(fromRel, spec) {
	const target = spec.startsWith(".") ? resolveRel(fromRel, spec) : "";
	if (fromRel.startsWith("features/fonts/vite/") && target === "features/fonts/registry.json") return true;
	if (fromRel !== "features/fonts/generate.ts") return false;
	return spec.startsWith("node:") || target.startsWith("features/fonts/shared/");
}

function allowed(fromRel, spec) {
	if (syncImport(fromRel, spec) || fontGenerator(fromRel, spec)) return true;
	const from = bucket(fromRel);
	const to = target(fromRel, spec);
	if (to === "pkg" || devHost(fromRel, spec)) return true;
	if (to === "node" && NODE_ADAPTERS.some((prefix) => fromRel.startsWith(prefix))) return true;
	const fromFeature = featureOf(from);
	const toFeature = featureOf(to);
	if (fromFeature && toFeature) return FEATURE_SIDES[sideOf(from)].has(sideOf(to)) && fromFeature === toFeature;
	if (fromFeature) return FEATURE_SIDES[sideOf(from)].has(to);
	// vite/ composes a feature's vite side when the app passed that option (00-rules).
	if (from === "vite" && toFeature) return sideOf(to) === "vite";
	return PERMIT.has(`${from}>${to}`);
}

const rule = {
	create(context) {
		return {
			ImportDeclaration(node) {
				if (context.filename.includes(".test.")) return;
				if (context.filename.includes("/tests/")) return;
				const from = srcRel(context.filename);
				if (from === null) return;
				if (allowed(from, String(node.source.value))) return;
				context.report({ node, message: "import is outside the module boundaries" });
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: {
		boundaries: rule,
		"no-module-side-effects": noModuleSideEffects,
		"no-module-state": noModuleState,
		"no-v8-ignore": noV8Ignore,
		"path-prefix": pathPrefix,
		"location-only-in-redirect": locationOnlyInRedirect,
		"funnel-only": funnelOnly,
		"no-flare-header-branching": noFlareHeaderBranching,
	},
};
