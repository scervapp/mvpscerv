// components/customer/TopRatedSection.js
import React, { useEffect, useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	FlatList,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { useTranslation } from 'react-i18next';

import { Ionicons } from "@expo/vector-icons";
import colors from "../../utils/styles/appStyles";
import { db } from "../../config/firebase.native";
import { getDiscoveryDishLabel } from "../../utils/menuDisplay";
import {
	collection,
	getDocs,
	limit,
	orderBy,
	query,
	where,
} from "@react-native-firebase/firestore";

// Star Rating Display
const StarRating = ({ rating }) => {
	const full = Math.floor(rating);
	const hasHalf = rating % 1 >= 0.5;
	return (
		<View style={styles.stars}>
			{[1, 2, 3, 4, 5].map((i) => (
				<Ionicons
					key={i}
					name={
						i <= full
							? "star"
							: i === full + 1 && hasHalf
							? "star-half"
							: "star-outline"
					}
					size={14}
					color="#FFD700"
					style={{ marginRight: 1 }}
				/>
			))}
		</View>
	);
};

const TopRatedSection = ({ category, title, onPressItem }) => {
	const { t } = useTranslation();
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetch = async () => {
			try {
				const q = query(
					collection(db, "menuItems"),
					where("category", "==", category),
					where("averageRating", ">=", 4.0),
					orderBy("averageRating", "desc"),
					orderBy("ratingCount", "desc"),
					limit(6)
				);
				const snap = await getDocs(q);
				const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
				setItems(data);
			} catch (e) {
				console.error("TopRatedSection error:", e);
			} finally {
				setLoading(false);
			}
		};
		fetch();
	}, [category]);

	if (loading) return <ActivityIndicator style={{ marginVertical: 20 }} />;
	if (!items.length) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.title}>{title}</Text>
			<FlatList
				data={items}
				horizontal
				showsHorizontalScrollIndicator={false}
				keyExtractor={(i) => i.id}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={styles.item}
						onPress={() => onPressItem(item)}
					>
						<Text style={styles.itemName} numberOfLines={1}>
							{getDiscoveryDishLabel(item)}
						</Text>
						<View style={styles.ratingRow}>
							<StarRating rating={item.averageRating} />
							<Text style={styles.ratingText}>
								{item.averageRating.toFixed(1)} ({item.ratingCount})
							</Text>
						</View>
						<Text style={styles.restaurant} numberOfLines={1}>
							{item.restaurantName}
						</Text>
					</TouchableOpacity>
				)}
				contentContainerStyle={{ paddingLeft: 20 }}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	section: { marginVertical: 16 },
	title: {
		fontSize: 18,
		fontWeight: "bold",
		color: colors.textDark,
		marginBottom: 8,
		paddingHorizontal: 20,
	},
	item: {
		backgroundColor: "#fff",
		width: 180,
		padding: 12,
		marginRight: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#eee",
	},
	itemName: {
		fontSize: 15,
		fontWeight: "600",
		color: colors.textDark,
	},
	ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
	ratingText: { marginLeft: 6, fontSize: 13, color: colors.textMedium },
	restaurant: { marginTop: 4, fontSize: 13, color: colors.textLight },
	stars: { flexDirection: "row" },
});

export default TopRatedSection;
