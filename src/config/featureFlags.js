export const PICKUP_FLOW_ENABLED = false;

export const isPickupEnabledForRestaurant = (restaurant) =>
	PICKUP_FLOW_ENABLED &&
	(restaurant?.features?.pickupEnabled === true ||
		restaurant?.pickupEnabled === true);
