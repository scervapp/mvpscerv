// src/styles/theme.js

const theme = {
	colors: {
		// Core Brand Colors
		primary: "#0e6f7f", // Scerv Teal
		primaryDark: "#082f3a", // Deep hospitality navy
		secondary: "#f18220", // Scerv Orange
		secondaryDark: "#c96313", // Darker Orange (for hover states on CTA buttons)

		// Backgrounds & Text
		background: "#f7f8f8", // Crisp off-white for enterprise pages
		text: "#132027", // Deep neutral for stronger editorial contrast
		textLight: "#5a6670", // Muted operator copy
		white: "#ffffff",
		black: "#000000",

		// UI Elements
		gray: "#dfe5e7", // Clean borders and dividers
		grayDark: "#43515a",
		accent: "#e5f3f5", // Soft teal for highlighted backgrounds

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
