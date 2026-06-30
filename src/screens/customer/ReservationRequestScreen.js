import React, { useContext, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "@react-native-firebase/functions";

import { AuthContext } from "../../context/authContext";
import { functions } from "../../config/firebase";
import colors from "../../utils/styles/appStyles";

const formatDateInput = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
};

const ReservationRequestScreen = ({ route, navigation }) => {
	const { currentUserData } = useContext(AuthContext);
	const restaurant = route.params?.restaurant;

	const [date, setDate] = useState(formatDateInput(new Date()));
	const [partySize, setPartySize] = useState("2");
	const [preferredTimeWindow, setPreferredTimeWindow] = useState("");
	const [occasion, setOccasion] = useState("");
	const [seatingPreference, setSeatingPreference] = useState("");
	const [allergyNotes, setAllergyNotes] = useState("");
	const [guestNotes, setGuestNotes] = useState("");
	const [slots, setSlots] = useState([]);
	const [selectedTime, setSelectedTime] = useState(null);
	const [isLoadingSlots, setIsLoadingSlots] = useState(false);
	const [hasSearchedSlots, setHasSearchedSlots] = useState(false);
	const [slotMessage, setSlotMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);

	const dateChips = useMemo(
		() =>
			[0, 1, 2, 3, 4, 5, 6].map((offset) => {
				const chipDate = addDays(new Date(), offset);
				return {
					label:
						offset === 0
							? "Today"
							: chipDate.toLocaleDateString(undefined, {
									weekday: "short",
									month: "short",
									day: "numeric",
								}),
					value: formatDateInput(chipDate),
				};
			}),
		[],
	);

	const handleLoadSlots = async () => {
		if (!restaurant?.id) return;
		const parsedPartySize = Number(partySize);
		if (!date || !parsedPartySize || parsedPartySize < 1) {
			Alert.alert("Missing info", "Choose a date and party size.");
			return;
		}

		setIsLoadingSlots(true);
		setSelectedTime(null);
		setHasSearchedSlots(false);
		setSlotMessage("");

		try {
			const getSlots = httpsCallable(functions, "getAvailableReservationSlots");
			const result = await getSlots({
				restaurantId: restaurant.id,
				date,
				partySize: parsedPartySize,
			});
			const availableSlots = result.data?.slots || [];
			setSlots(availableSlots);
			// Empty availability is not an error; show guests why nothing appeared.
			setSlotMessage(
				result.data?.message ||
					(availableSlots.length === 0
						? "No reservation times are available for this date."
						: ""),
			);
			setHasSearchedSlots(true);
		} catch (error) {
			console.error("Error loading reservation slots:", error);
			Alert.alert(
				"Could not load times",
				error.message || "Please try another date.",
			);
			setSlots([]);
			setSlotMessage(error.message || "Please try another date.");
			setHasSearchedSlots(true);
		} finally {
			setIsLoadingSlots(false);
		}
	};

	const handleSubmit = async () => {
		if (!selectedTime) {
			Alert.alert("Select a time", "Choose an available reservation time.");
			return;
		}

		setIsSubmitting(true);

		try {
			const createRequest = httpsCallable(functions, "createReservationRequest");
			await createRequest({
				restaurantId: restaurant.id,
				date,
				time: selectedTime,
				partySize: Number(partySize),
				customerName:
					`${currentUserData?.firstName || ""} ${
						currentUserData?.lastName || ""
					}`.trim() || currentUserData?.displayName,
				customerEmail: currentUserData?.email || null,
				occasion,
				seatingPreference,
				allergyNotes,
				guestNotes,
			});

			Alert.alert(
				"Request sent",
				"The restaurant will confirm your reservation shortly.",
				[{ text: "OK", onPress: () => navigation.goBack() }],
			);
		} catch (error) {
			console.error("Error creating reservation request:", error);
			Alert.alert(
				"Could not request reservation",
				error.message || "Please try another time.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleJoinWaitlist = async () => {
		if (!restaurant?.id) return;
		const parsedPartySize = Number(partySize);
		if (!date || !parsedPartySize || parsedPartySize < 1) {
			Alert.alert("Missing info", "Choose a date and party size.");
			return;
		}

		setIsJoiningWaitlist(true);

		try {
			const joinWaitlist = httpsCallable(functions, "joinReservationWaitlist");
			await joinWaitlist({
				restaurantId: restaurant.id,
				date,
				partySize: parsedPartySize,
				preferredTimeWindow,
				customerName:
					`${currentUserData?.firstName || ""} ${
						currentUserData?.lastName || ""
					}`.trim() || currentUserData?.displayName,
				customerEmail: currentUserData?.email || null,
				occasion,
				seatingPreference,
				allergyNotes,
				guestNotes,
			});

			Alert.alert(
				"You're on the waitlist",
				"We'll offer you a spot if one opens for this date.",
				[{ text: "OK", onPress: () => navigation.goBack() }],
			);
		} catch (error) {
			console.error("Error joining reservation waitlist:", error);
			Alert.alert("Could not join waitlist", error.message || "Please try again.");
		} finally {
			setIsJoiningWaitlist(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.title}>Request a reservation</Text>
				<Text style={styles.subtitle}>{restaurant?.restaurantName}</Text>

				<Text style={styles.label}>Date</Text>
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{dateChips.map((chip) => (
						<TouchableOpacity
							key={chip.value}
							style={[styles.chip, date === chip.value && styles.chipActive]}
							onPress={() => {
								setDate(chip.value);
								setSlots([]);
								setSelectedTime(null);
								setHasSearchedSlots(false);
								setSlotMessage("");
							}}
						>
							<Text
								style={[
									styles.chipText,
									date === chip.value && styles.chipTextActive,
								]}
							>
								{chip.label}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>

				<TextInput
					value={date}
					onChangeText={(value) => {
						setDate(value);
						setSlots([]);
						setSelectedTime(null);
						setHasSearchedSlots(false);
						setSlotMessage("");
					}}
					style={styles.input}
					placeholder="YYYY-MM-DD"
					placeholderTextColor={colors.textLight}
				/>

				<Text style={styles.label}>Party size</Text>
				<TextInput
					value={partySize}
					onChangeText={(value) => {
						setPartySize(value);
						setSlots([]);
						setSelectedTime(null);
						setHasSearchedSlots(false);
						setSlotMessage("");
					}}
					style={styles.input}
					keyboardType="number-pad"
					placeholder="2"
					placeholderTextColor={colors.textLight}
				/>

				<Text style={styles.label}>Preferred waitlist time</Text>
				<TextInput
					value={preferredTimeWindow}
					onChangeText={setPreferredTimeWindow}
					style={styles.input}
					placeholder="Any time, 6:30-8:00, after 7..."
					placeholderTextColor={colors.textLight}
				/>

				<TouchableOpacity
					style={styles.primaryButton}
					onPress={handleLoadSlots}
					disabled={isLoadingSlots}
				>
					{isLoadingSlots ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.primaryButtonText}>Find available times</Text>
					)}
				</TouchableOpacity>

				{slots.length > 0 ? (
					<View style={styles.slotGrid}>
						{slots.map((slot) => (
							<TouchableOpacity
								key={slot.time}
								style={[
									styles.slotButton,
									selectedTime === slot.time && styles.slotButtonActive,
								]}
								onPress={() => setSelectedTime(slot.time)}
							>
								<Text
									style={[
										styles.slotText,
										selectedTime === slot.time && styles.slotTextActive,
									]}
								>
									{slot.time}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				) : hasSearchedSlots && !isLoadingSlots ? (
					<View style={styles.emptySlotsCard}>
						<Ionicons name="time-outline" size={18} color={colors.textMedium} />
						<Text style={styles.emptySlotsText}>
							{slotMessage || "No reservation times are available for this date."}
						</Text>
					</View>
				) : null}

				<Text style={styles.label}>Occasion</Text>
				<TextInput
					value={occasion}
					onChangeText={setOccasion}
					style={styles.input}
					placeholder="Birthday, date night, business dinner..."
					placeholderTextColor={colors.textLight}
				/>

				<Text style={styles.label}>Seating preference</Text>
				<TextInput
					value={seatingPreference}
					onChangeText={setSeatingPreference}
					style={styles.input}
					placeholder="Booth, patio, quiet table..."
					placeholderTextColor={colors.textLight}
				/>

				<Text style={styles.label}>Allergies or dietary needs</Text>
				<TextInput
					value={allergyNotes}
					onChangeText={setAllergyNotes}
					style={styles.textArea}
					placeholder="Shellfish allergy, gluten-free, high chair..."
					placeholderTextColor={colors.textLight}
					multiline
				/>

				<Text style={styles.label}>Notes for the restaurant</Text>
				<TextInput
					value={guestNotes}
					onChangeText={setGuestNotes}
					style={styles.textArea}
					placeholder="Anything that helps them host you better."
					placeholderTextColor={colors.textLight}
					multiline
				/>

				<TouchableOpacity
					style={[
						styles.submitButton,
						(!selectedTime || isSubmitting) && styles.buttonDisabled,
					]}
					onPress={handleSubmit}
					disabled={!selectedTime || isSubmitting}
				>
					{isSubmitting ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<Ionicons name="calendar-outline" size={18} color="#fff" />
							<Text style={styles.submitButtonText}>Request reservation</Text>
						</>
					)}
				</TouchableOpacity>

				{hasSearchedSlots && slots.length === 0 ? (
					<TouchableOpacity
						style={styles.waitlistButton}
						onPress={handleJoinWaitlist}
						disabled={isJoiningWaitlist}
					>
						{isJoiningWaitlist ? (
							<ActivityIndicator color={colors.primary} />
						) : (
							<>
								<Ionicons
									name="notifications-outline"
									size={18}
									color={colors.primary}
								/>
								<Text style={styles.waitlistButtonText}>Join waitlist</Text>
							</>
						)}
					</TouchableOpacity>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: colors.backgroundLight },
	container: { padding: 20, paddingBottom: 36 },
	title: {
		fontSize: 26,
		fontWeight: "900",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 15,
		color: colors.textMedium,
		marginTop: 4,
		marginBottom: 20,
	},
	label: {
		fontSize: 13,
		fontWeight: "800",
		color: colors.textDark,
		marginTop: 14,
		marginBottom: 8,
	},
	input: {
		minHeight: 50,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		paddingHorizontal: 12,
		color: colors.textDark,
		fontSize: 15,
	},
	textArea: {
		minHeight: 86,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 8,
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		color: colors.textDark,
		fontSize: 15,
		textAlignVertical: "top",
	},
	chip: {
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		marginRight: 8,
		marginBottom: 10,
	},
	chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	chipText: { color: colors.textDark, fontWeight: "700" },
	chipTextActive: { color: "#fff" },
	primaryButton: {
		minHeight: 50,
		backgroundColor: colors.primary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 16,
	},
	primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
	slotGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 14,
	},
	slotButton: {
		width: "30%",
		minHeight: 44,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		alignItems: "center",
		justifyContent: "center",
		marginRight: "3.33%",
		marginBottom: 10,
	},
	slotButtonActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	slotText: { color: colors.textDark, fontWeight: "800" },
	slotTextActive: { color: "#fff" },
	emptySlotsCard: {
		marginTop: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.borderLight,
		backgroundColor: colors.surfaceWhite,
		padding: 12,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	emptySlotsText: {
		flex: 1,
		color: colors.textMedium,
		fontSize: 13,
		fontWeight: "700",
	},
	submitButton: {
		minHeight: 54,
		backgroundColor: colors.primary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		marginTop: 22,
	},
	submitButtonText: {
		color: "#fff",
		fontWeight: "900",
		fontSize: 16,
		marginLeft: 8,
	},
	buttonDisabled: { opacity: 0.55 },
	waitlistButton: {
		minHeight: 50,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		marginTop: 12,
		backgroundColor: colors.surfaceWhite,
	},
	waitlistButtonText: {
		color: colors.primary,
		fontWeight: "900",
		fontSize: 15,
		marginLeft: 8,
	},
});

export default ReservationRequestScreen;
