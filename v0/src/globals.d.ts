/**
 * Flare Global Types
 *
 * Reference this file in generated types for global type augmentation.
 * Usage: /// <reference types="@flare/v0/globals" />
 *
 * Includes JSX extensions for css and tw props.
 */

/// <reference path="./jsx.d.ts" />

/* Vite ImportMeta extensions */
declare global {
	interface ImportMetaEnv {
		readonly DEV: boolean
		readonly MODE: string
		readonly PROD: boolean
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv
		readonly hot?: {
			accept: () => void
			dispose: (callback: () => void) => void
			on: (event: string, callback: () => void) => void
		}
	}
}
