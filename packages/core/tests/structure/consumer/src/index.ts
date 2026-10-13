// Every public entry, a font module, and an optimized image, as an app imports them from the installed package.
import { createFont, createPage, createRouter, FontCSS, Image } from "@lovrozagar/flare";
import { createClient } from "@lovrozagar/flare/client";
import { defineLayouts, defineRouteTree } from "@lovrozagar/flare/generated";
import { createTranslations, LocaleProvider } from "@lovrozagar/flare/i18n";
import { i18n } from "@lovrozagar/flare/i18n/server";
import { createQueryClientGetter } from "@lovrozagar/flare/query";
import { sitemap } from "@lovrozagar/flare/seo";
import { createServer } from "@lovrozagar/flare/server";
import { createServerFn } from "@lovrozagar/flare/server-fn";
import { createBunFetch } from "@lovrozagar/flare/adapters/bun";
import { createNodeListener } from "@lovrozagar/flare/adapters/node";
import { createWorkersHandler } from "@lovrozagar/flare/adapters/workers";
import { createCacheApiStore } from "@lovrozagar/flare/stores/cache-api";
import { createFilesystemStore } from "@lovrozagar/flare/stores/fs";
import { createTestServer, flarePage } from "@lovrozagar/flare/testing";
import { flare } from "@lovrozagar/flare/vite";
import inter from "@lovrozagar/flare/fonts/inter";
import photo from "./a.png?image";
import plain from "./a.png";

export const entries = [
	createFont,
	createPage,
	createRouter,
	FontCSS,
	Image,
	createClient,
	defineLayouts,
	defineRouteTree,
	createTranslations,
	LocaleProvider,
	i18n,
	createQueryClientGetter,
	sitemap,
	createServer,
	createServerFn,
	createBunFetch,
	createNodeListener,
	createWorkersHandler,
	createCacheApiStore,
	createFilesystemStore,
	createTestServer,
	flarePage,
	flare,
];

// The `?image` binding, a plain import that stays vite/client's URL string, and a font's metadata.
export const width: number = photo.width;
export const variants: readonly { width: number; src: string }[] = photo.variants;
export const url: string = plain;
export const family: string = inter.family;
