export const formatCurrencyFromDollars = (amount) => {
	const numericAmount = Number(amount);
	if (!Number.isFinite(numericAmount)) {
		return "$0.00";
	}
	return `${numericAmount < 0 ? "-" : ""}$${Math.abs(numericAmount).toFixed(2)}`;
};

export const normalizeMenuPriceToDollars = (amount) => {
	const numericAmount = Number(amount);
	if (!Number.isFinite(numericAmount)) {
		return 0;
	}

	// Most app-created menu prices are dollars. Older seeded menu data used cents.
	return Math.abs(numericAmount) >= 250 ? numericAmount / 100 : numericAmount;
};

export const formatMenuPrice = (amount) =>
	formatCurrencyFromDollars(normalizeMenuPriceToDollars(amount));

const formatCurrency = (cents) => {
	const numericCents = Number(cents);
	if (!Number.isFinite(numericCents)) {
		return "$0.00";
	}
	return formatCurrencyFromDollars(numericCents / 100);
};

export default formatCurrency;
