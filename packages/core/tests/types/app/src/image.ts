/// <reference types="vite/client" />
import type {} from "@lovrozagar/flare/vite";
import photo from "./photo.png?image";
import plain from "./photo.png";

// image import: `?image` binds to the plugin's object, and a plain import stays vite/client's URL string (B88).
export const binding: {
	src: string;
	width: number;
	height: number;
	variants: readonly { width: number; src: string }[];
} = photo;
export const url: string = plain;
// @ts-expect-error a plain import is a URL string
export const width: number = plain.width;
