// src/styles/theme.js

const theme = {
	colors: {
		// Core Brand Colors
		primary: "#106b7d", // Scerv Teal
		primaryDark: "#0c5260", // Darker Teal (for hover states on primary buttons)
		secondary: "#f18220", // Scerv Orange
		secondaryDark: "#d9741c", // Darker Orange (for hover states on CTA buttons)

		// Backgrounds & Text
		background: "#f9fafb", // A very crisp, slightly cool off-white
		text: "#2b2b2b", // Near-black for maximum contrast and readability
		textLight: "#5c5959", // Your custom Gray (perfect for subtitles and secondary text)
		white: "#ffffff",
		black: "#000000",

		// UI Elements
		gray: "#e5e7eb", // A much lighter gray for clean borders and dividers
		grayDark: "#5c5959", // Keeping your exact gray mapped here just in case
		accent: "#e6f2f4", // A very soft, transparent-looking teal for highlighted backgrounds

		// System Feedback
		error: "#dc3545", // Standard red for errors/cancels
		success: "#28a745", // Standard green for success/confirmations
	},
	fonts: {
		heading: "'Poppins', sans-serif",
		body: "'Open Sans', sans-serif",
	},
	breakpoints: {
		sm: "576px",
		md: "768px",
		lg: "992px",
		xl: "1200px",
	},
	spacing: {
		xs: "4px",
		sm: "8px",
		md: "16px",
		lg: "24px",
		xl: "32px",
	},
	radius: {
		sm: "4px",
		md: "8px",
		lg: "12px",
	},
};

export default theme;
