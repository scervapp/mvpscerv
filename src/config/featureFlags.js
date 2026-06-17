import { getRestaurantExperienceConfig } from "../utils/restaurantExperience";

export const PICKUP_FLOW_ENABLED = false;

export const isPickupEnabledForRestaurant = (restaurant) =>
	PICKUP_FLOW_ENABLED &&
	getRestaurantExperienceConfig(restaurant).features.pickup === true;
