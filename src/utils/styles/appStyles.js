// src/utils/styles/colors.js (or your appStyles.js)

const colors = {
	// --- NEW MODERN PALETTE (Turquoise Primary, Orange Accent) ---
	// Brand Colors
	brandTurquoise: "#006d77", // Vibrant, clean Turquoise
	brandOrange: "#FD7E14", // Energetic Orange

	// Neutrals
	backgroundLight: "#F8F9FA", // Very light, clean gray for screen backgrounds
	surfaceWhite: "#FFFFFF", // Pure White for cards, modals, input backgrounds

	// Text Colors
	textDark: "#212529", // Very dark gray (near black) for main text
	textMedium: "#6C757D", // Medium gray for subtitles, less emphasized text
	textLight: "#ADB5BD", // Lighter gray for disabled text or icons
	textOnPrimaryBrand: "#FFFFFF", // White text for use on brandTurquoise
	textOnAccentBrand: "#FFFFFF", // White text for use on brandOrange

	// Borders & Dividers
	borderLight: "#DEE2E6", // Light gray for subtle borders
	borderFocus: "#80BDFF", // Light blue for input focus indication

	// Semantic Colors
	statusSuccess: "#28A745", // Clear, positive Green
	statusWarning: "#FFC107", // Standard Amber/Yellow for warnings
	statusDanger: "#DC3545", // Clear, understandable Red for errors
	statusInfo: "#0D6EFD", // Standard, clear Blue for informational messages

	// --- MAPPING FOR YOUR EXISTING COLOR NAMES ---
	// We'll map your old names to the new palette.
	// This allows existing components to pick up the new color values immediately.

	primary: "#006d77", // Mapped to: brandTurquoise (Your new primary)
	// Old: "#000080" (Deep Navy)

	secondary: "#FD7E14", // Mapped to: brandOrange (Your new strong accent)
	// Old: "#00FFFF" (Light Aqua) - Orange is a better general accent here.
	// If you need a less prominent secondary, consider 'textMedium' or a lighter turquoise.

	accent: "#FFFFFF", // Mapped to: surfaceWhite (For white surfaces, as before)
	// Old: "#FFFFFF" (Crisp White)

	background: "#F8F9FA", // Mapped to: backgroundLight (Your new light gray background)
	// Old: "#F0F0F0" (Example light gray background)

	text: "#212529", // Mapped to: textDark (Your new main dark text color)
	// Old: "#333333" (Dark text)

	inputBackground: "#FFFFFF", // Mapped to: surfaceWhite (Inputs often look good on white)
	// Old: "#f0f0f0"

	warning: "#DC3545", // Mapped to: statusDanger (Your old 'warning' was reddish-orange, better as danger)
	// Old: "#FF6C44"
	// If you need a yellow warning, use 'statusWarning' ('#FFC107') directly.

	lightGray: "#DEE2E6", // Mapped to: borderLight (A suitable light gray for dividers/borders)
	// Old: "#F0F0F0"

	// --- You can keep adding more specific semantic names from the previous suggestion as you refactor ---
	// e.g., successLight, warningLight, dangerLight, infoLight,
	// gray100-900, blackAlpha10, whiteAlpha70 etc.
};

export default colors;
