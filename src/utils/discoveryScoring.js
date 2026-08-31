const SCORE_VERSION = 1;
const GLOBAL_AVERAGE_RATING = 4.2;
const MINIMUM_CONFIDENCE_RATINGS = 12;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toFiniteNumber = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const logWeight = (value, maxValue) => {
	const safeValue = Math.max(0, toFiniteNumber(value));
	if (safeValue <= 0) return 0;
	return clamp(Math.log10(safeValue + 1) / Math.log10(maxValue + 1), 0, 1);
};

export const calculateConfidenceAdjustedRating = (averageRating, ratingCount) => {
	const count = Math.max(0, toFiniteNumber(ratingCount));
	const rating = clamp(toFiniteNumber(averageRating, GLOBAL_AVERAGE_RATING), 0, 5);
	return (
		(count / (count + MINIMUM_CONFIDENCE_RATINGS)) * rating +
		(MINIMUM_CONFIDENCE_RATINGS / (count + MINIMUM_CONFIDENCE_RATINGS)) *
			GLOBAL_AVERAGE_RATING
	);
};

export const calculateScervDiscoveryScore = (item = {}) => {
	const averageRating = toFiniteNumber(item.averageRating || item.rating || 0);
	const ratingCount = Math.max(0, toFiniteNumber(item.ratingCount || 0));
	const reviewCount = Math.max(0, toFiniteNumber(item.reviewCount || 0));
	const orderCount = Math.max(0, toFiniteNumber(item.orderCount || 0));
	const favoriteCount = Math.max(0, toFiniteNumber(item.favoriteCount || 0));
	const verificationStats = item.verificationStats || {};
	const mediaCount = Array.isArray(item.media)
		? item.media.length
		: Math.max(0, toFiniteNumber(item.mediaCount || 0));
	const confidenceAdjustedRating = calculateConfidenceAdjustedRating(
		averageRating,
		ratingCount,
	);
	const verifiedSignals =
		toFiniteNumber(verificationStats.scervOrderVerifiedCount) * 1 +
		toFiniteNumber(verificationStats.receiptVerifiedCount) * 0.7 +
		toFiniteNumber(verificationStats.locationVerifiedCount) * 0.45 +
		toFiniteNumber(verificationStats.communityReviewCount) * 0.2;

	const components = {
		rating: Number(((confidenceAdjustedRating / 5) * 62).toFixed(2)),
		volume: Number((logWeight(ratingCount, 80) * 14).toFixed(2)),
		reviews: Number((logWeight(reviewCount, 45) * 8).toFixed(2)),
		verification: Number((clamp(verifiedSignals / 40, 0, 1) * 10).toFixed(2)),
		media: Number((clamp(mediaCount / 6, 0, 1) * 4).toFixed(2)),
		orders: Number((logWeight(orderCount, 120) * 2).toFixed(2)),
		favorites: Number((logWeight(favoriteCount, 50) * 0.75).toFixed(2)),
	};
	const score = clamp(
		Object.values(components).reduce((total, value) => total + value, 0),
		0,
		100,
	);

	// Mirror the Cloud Function score so local screens rank dishes consistently.
	return {
		score: Number(score.toFixed(2)),
		confidenceAdjustedRating: Number(confidenceAdjustedRating.toFixed(4)),
		components,
		version: SCORE_VERSION,
	};
};

export const getStoredScervScore = (item = {}) => {
	const storedScore = Number(item.scervScore || 0);
	if (Number.isFinite(storedScore) && storedScore > 0) return storedScore;

	const legacyScore = Number(item.discoveryScore || 0);
	if (Number.isFinite(legacyScore) && legacyScore > 0) {
		return legacyScore <= 6
			? Number(((legacyScore / 5.5) * 100).toFixed(2))
			: legacyScore;
	}

	return calculateScervDiscoveryScore(item).score;
};
