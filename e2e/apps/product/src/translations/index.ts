import { createTranslations } from "@lovrozagar/flare/i18n";

export const translations = createTranslations({
	common: {
		en: () => import("./en/common"),
		fr: () => import("./fr/common"),
		hr: () => import("./hr/common"),
	},
});
