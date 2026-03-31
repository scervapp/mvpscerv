// screens/restaurant/RestaurantDashboardScreen.js
import React, { useContext, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    Dimensions,
} from "react-native";
import { Button, Surface } from "react-native-paper"; // Added Surface for better shadows
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import moment from "moment";

import { useWorkDay } from "../../context/restaurant/WorkDayContext";
import { AuthContext } from "../../context/authContext";
import { useEmployeeSession } from "../../context/restaurant/EmployeeSessionContext";
import colors from "../../utils/styles/appStyles";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

const DashboardCard = ({ label, iconName, onPress, color = colors.primary }) => {
    const { t } = useTranslation();
    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
            <Surface style={styles.cardSurface}>
                <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
                    <MaterialCommunityIcons name={iconName} size={32} color={color} />
                </View>
                <Text style={styles.cardLabel}>{t(label)}</Text>
                <View style={styles.cardArrow}>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMedium} />
                </View>
            </Surface>
        </TouchableOpacity>
    );
};

const RestaurantDashboardScreen = () => {
    const { t } = useTranslation();
    const navigation = useNavigation();
    const { currentUserData } = useContext(AuthContext);
    const { currentWorkDay, workDayStatus, isLoading, startWorkDay, endWorkDay } = useWorkDay();
    const { activeSession } = useEmployeeSession();
    const [isActionLoading, setIsActionLoading] = useState(false);

    const handleBackOfficePress = () => {
        if (activeSession?.role === "owner" || activeSession?.role === "manager") {
            navigation.navigate("BackOfficeNavigator", { screen: "BackOffice" });
        } else {
            Alert.alert(t("access_denied"), t("managers_only_back_office"));
        }
    };

    const renderStatusHeader = () => {
        const isOpen = workDayStatus === "OPEN" && currentWorkDay;
        const statusColor = isOpen ? colors.statusSuccess : colors.statusDanger;

        return (
            <View style={[styles.statusBanner, { backgroundColor: statusColor }]}>
                <View style={styles.statusInfo}>
                    <Text style={styles.statusLabel}>
                        {isOpen ? t("LIVE OPERATIONS") : t("OFFLINE")}
                    </Text>
                    <Text style={styles.statusMainText}>
                        {isOpen ? t("Restaurant is Open") : t("Restaurant is Closed")}
                    </Text>
                    {isOpen && (
                        <Text style={styles.statusTime}>
                            {t("Started at")} {moment(currentWorkDay.startTime?.toDate()).format("LT")}
                        </Text>
                    )}
                </View>
                <TouchableOpacity 
                    style={styles.statusToggleBtn} 
                    onPress={isOpen ? handleEndDay : handleStartDay}
                    disabled={isActionLoading}
                >
                    {isActionLoading ? (
                        <ActivityIndicator color={statusColor} />
                    ) : (
                        <Text style={[styles.statusToggleText, { color: statusColor }]}>
                            {isOpen ? t("Close Shop") : t("Open Shop")}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    const handleStartDay = async () => { /* same logic */ await startWorkDay(); };
    const handleEndDay = () => { /* same logic */ 
        Alert.alert(t("end_work_day"), t("confirm?"), [
            { text: t("cancel") },
            { text: t("end"), onPress: async () => { await endWorkDay(); } }
        ]);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                {/* Enterprise Header */}
                <View style={styles.brandHeader}>
                    <View>
                        <Text style={styles.brandName}>{currentUserData?.restaurantName || "SCERV POS"}</Text>
                        <Text style={styles.userRole}>
                            {activeSession?.name} • {activeSession?.jobTitle?.toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.dateContainer}>
                        <Text style={styles.dateText}>{moment().format("ddd, MMM Do")}</Text>
                    </View>
                </View>

                {renderStatusHeader()}

                <Text style={styles.sectionTitle}>{t("Main Operations")}</Text>
                <View style={styles.navigationGrid}>
                    <DashboardCard
                        label="Check-ins"
                        iconName="account-clock-outline"
                        color="#6366f1"
                        onPress={() => navigation.navigate("Checkins")}
                    />
                    <DashboardCard
                        label="Kitchen"
                        iconName="silverware-fork-knife"
                        color="#f59e0b"
                        onPress={() => navigation.navigate("ChefsQ")}
                    />
                    <DashboardCard
                        label="Back Office"
                        iconName="shield-check-outline"
                        color="#10b981"
                        onPress={handleBackOfficePress}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#F3F4F6" },
    container: { flex: 1 },
    brandHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        backgroundColor: colors.surfaceWhite,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    brandName: { fontSize: 22, fontWeight: '800', color: colors.textDark, letterSpacing: -0.5 },
    userRole: { fontSize: 12, fontWeight: '600', color: colors.textMedium, marginTop: 2 },
    dateContainer: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    dateText: { fontSize: 12, fontWeight: '700', color: colors.textDark },
    
    statusBanner: {
        margin: 20,
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
    },
    statusInfo: { flex: 1 },
    statusLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    statusMainText: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 4 },
    statusTime: { color: '#FFF', fontSize: 13, marginTop: 2, opacity: 0.9 },
    statusToggleBtn: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    statusToggleText: { fontWeight: '800', fontSize: 14 },

    sectionTitle: { paddingHorizontal: 24, fontSize: 14, fontWeight: '800', color: colors.textMedium, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
    navigationGrid: { paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap' },
    card: { width: '50%', padding: 8 },
    cardSurface: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 20,
        height: 160,
        justifyContent: 'space-between',
        elevation: 2,
    },
    iconCircle: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    cardLabel: { fontSize: 16, fontWeight: '700', color: colors.textDark },
    cardArrow: { position: 'absolute', right: 15, bottom: 20 },
});

export default RestaurantDashboardScreen;