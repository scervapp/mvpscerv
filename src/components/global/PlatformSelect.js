import React from "react";
import {
	ActionSheetIOS,
	Platform,
	Text,
	TouchableOpacity,
	StyleSheet,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";

const PlatformSelect = ({
	value,
	onValueChange,
	options = [],
	placeholder,
	title,
	style,
	pickerStyle,
	itemStyle,
	disabled = false,
}) => {
	const selectedOption = options.find((option) => option.value === value);
	const label = selectedOption?.label || placeholder || "";

	const openActionSheet = () => {
		if (disabled || Platform.OS !== "ios") return;

		const labels = options.map((option) => option.label);
		const cancelButtonIndex = labels.length;

		ActionSheetIOS.showActionSheetWithOptions(
			{
				title,
				options: [...labels, "Cancel"],
				cancelButtonIndex,
				userInterfaceStyle: "light",
			},
			(buttonIndex) => {
				if (buttonIndex === cancelButtonIndex) return;
				onValueChange(options[buttonIndex]?.value);
			},
		);
	};

	if (Platform.OS === "ios") {
		return (
			<TouchableOpacity
				style={[styles.selectButton, style, disabled && styles.disabled]}
				onPress={openActionSheet}
				activeOpacity={0.75}
				disabled={disabled}
			>
				<Text
					style={[
						styles.selectText,
						!selectedOption && placeholder && styles.placeholderText,
					]}
					numberOfLines={1}
				>
					{label}
				</Text>
				<Ionicons name="chevron-down" size={18} color={colors.textMedium} />
			</TouchableOpacity>
		);
	}

	return (
		<Picker
			selectedValue={value}
			onValueChange={onValueChange}
			style={pickerStyle}
			itemStyle={itemStyle}
			enabled={!disabled}
			dropdownIconColor={colors.textDark}
		>
			{placeholder && <Picker.Item label={placeholder} value={null} />}
			{options.map((option) => (
				<Picker.Item
					key={String(option.value)}
					label={option.label}
					value={option.value}
				/>
			))}
		</Picker>
	);
};

const styles = StyleSheet.create({
	selectButton: {
		minHeight: 50,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	selectText: {
		flex: 1,
		color: colors.textDark,
		fontSize: 16,
		paddingRight: 8,
	},
	placeholderText: {
		color: colors.textLight,
	},
	disabled: {
		opacity: 0.6,
	},
});

export default PlatformSelect;
