// Helper function for formatting cents to dollars (Keep this)
const formatCurrency = (cents) => {
	if (typeof cents !== "number" || isNaN(cents)) {
		return "$0.00";
	}
	const value = cents / 100;
	return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
};

export default formatCurrency;
