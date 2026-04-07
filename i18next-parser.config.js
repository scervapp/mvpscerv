module.exports = {
	locales: ["en", "es"],
	output: "src/locales/$LOCALE.json",
	input: ["src/**/*.{js,jsx,ts,tsx}"],
	keySeparator: false,
	namespaceSeparator: false,
	keepRemoved: true,
};
