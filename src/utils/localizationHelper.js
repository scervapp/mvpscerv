import i18n from "../config/i18n";

export const getLocalizedValue = (item, field) => {
	// 1. Get current app language (e.g., 'en' or 'es')
	const currentLang = i18n.language;

	// 2. Construct the key we are looking for (e.g., 'name_en')
	const localizedKey = `${field}_${currentLang}`;

	// 3. Check if that specific translation exists
	if (item && item[localizedKey]) {
		return item[localizedKey];
	}

	// 4. Fallback: If translation is missing (or cloud function hasn't run yet),
	// show the original field.
	return item ? item[field] : "";
};
