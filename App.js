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

export default function App() {
	return (
		<SafeAreaProvider>
			<ActionSheetProvider>
				<NotificationProvider>
					<AuthProvider>
						<RestaurantDataProvider>
							<WorkDayProvider>
								<EmployeeSessionProvider>
									<PartyProvider>
										<BasketProvider>
											<AppNavigator />
										</BasketProvider>
									</PartyProvider>
								</EmployeeSessionProvider>
							</WorkDayProvider>
						</RestaurantDataProvider>
					</AuthProvider>
				</NotificationProvider>
			</ActionSheetProvider>
		</SafeAreaProvider>
	);
}
