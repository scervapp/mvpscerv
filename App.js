import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { AuthProvider } from "./src/context/authContext";
import { BasketProvider } from "./src/context/customer/BasketContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { PartyProvider } from "./src/context/customer/PartyContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WorkDayProvider } from "./src/context/restaurant/WorkDayContext";
import { EmployeeSessionProvider } from "./src/context/restaurant/EmployeeSessionContext";
import { RestaurantDataProvider } from "./src/context/restaurant/RestaurantDataContext";
import { NotificationProvider } from "./src/context/NotificationProvider";
import { I18nextProvider } from "react-i18next";
import i18n from "./src/config/i18n"; // <-- Import i18n object

export default function App() {
	return (
		<SafeAreaProvider>
			<ActionSheetProvider>
				<NotificationProvider>
					<AuthProvider>
						<EmployeeSessionProvider>
							<RestaurantDataProvider>
								<WorkDayProvider>
									<PartyProvider>
										<BasketProvider>
											<I18nextProvider i18n={i18n}>
												<AppNavigator />
											</I18nextProvider>
										</BasketProvider>
									</PartyProvider>
								</WorkDayProvider>
							</RestaurantDataProvider>
						</EmployeeSessionProvider>
					</AuthProvider>
				</NotificationProvider>
			</ActionSheetProvider>
		</SafeAreaProvider>
	);
}
