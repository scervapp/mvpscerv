import { getRestaurantExperienceConfig } from "../utils/restaurantExperience";

// Global kill switch for pickup. Restaurant-level controls still decide whether a
// specific location can show pickup ordering to guests and staff.
export const PICKUP_FLOW_ENABLED = true;
export const SOCIAL_FEED_ENABLED = false;

export const isPickupEnabledForRestaurant = (restaurant) =>
	PICKUP_FLOW_ENABLED &&
	getRestaurantExperienceConfig(restaurant).features.pickup === true;
