import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import your translation files
import translationEN from "./locales/en/translation.json";
import translationES from "./locales/es/translation.json";

const resources = {
	en: {
		translation: translationEN,
	},
	es: {
		translation: translationES,
	},
};

i18n
	// Detects user language (e.g., from browser settings)
	.use(LanguageDetector)
	// Passes the i18n instance to react-i18next
	.use(initReactI18next)
	// Initializes i18next
	.init({
		resources,
		fallbackLng: "en", // If a detected language isn't available, default to English
		debug: false, // Set to true if you want to see translation logs in the console during development

		interpolation: {
			escapeValue: false, // React already safeguards from XSS
		},
	});

export default i18n;
