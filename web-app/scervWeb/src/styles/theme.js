// src/styles/theme.js

const theme = {
	colors: {
		primary: "#007bff",
		primaryDark: "#0056b3",
		secondary: "#6c757d",
		background: "#f8f8f8",
		text: "#333",
		textLight: "#666",
		accent: "#ffc107",
		white: "#fff",
		black: "#000",
		gray: "#ddd",
		error: "#dc3545", // Add error color
		success: "#28a745", //Add success color
	},
	fonts: {
		heading: "'Poppins', sans-serif",
		body: "'Open Sans', sans-serif", // Or your chosen body font
	},
	breakpoints: {
		sm: "576px",
		md: "768px",
		lg: "992px",
		xl: "1200px",
	},
	// Add other theme variables here, like spacing, border-radius, etc.
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
