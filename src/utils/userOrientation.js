import { useWindowDimensions } from "react-native";

export const userOrientation = () => {
	const { width, height } = useWindowDimensions();
	const isLandscape = width > height;
	return isLandscape;
};
