import { createTranslations } from "flare/i18n"

export const translations = createTranslations({
	common: {
		en: () => import("./en/common"),
		hr: () => import("./hr/common"),
	},
})
