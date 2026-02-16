import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "../locales/en.json";
import es from "../locales/es.json";

const resources = {
	en: { translation: en },
	es: { translation: es },
};

// This is the "Brain" that manages the memory
const languageDetector = {
	type: "languageDetector",
	async: true,
	init: () => {},
	detect: async function (callback) {
		try {
			// 1. Check if the user saved a preference before
			const savedLanguage = await AsyncStorage.getItem("user-language");

			// 2. If yes, use it. If no, use the phone's language
			const phoneLanguage = Localization.getLocales()[0].languageCode;

			callback(savedLanguage || phoneLanguage);
		} catch (error) {
			console.log("Error reading language", error);
			callback("en");
		}
	},
	cacheUserLanguage: async function (language) {
		try {
			// 3. Save the user's choice immediately when they toggle it
			await AsyncStorage.setItem("user-language", language);
		} catch (error) {}
	},
};

i18n
	.use(languageDetector) // Add the detector here
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: "en",
		compatibilityJSON: "v3",
		interpolation: {
			escapeValue: false,
		},
		react: {
			useSuspense: false,
		},
	});

export default i18n;
