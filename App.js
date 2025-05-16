import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { AuthProvider } from "./src/context/authContext";
import { BasketProvider } from "./src/context/customer/BasketContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { PartyProvider } from "./src/context/customer/PartyContext";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function App() {
	return (
		<SafeAreaProvider>
			<ActionSheetProvider>
				<AuthProvider>
					<PartyProvider>
						<BasketProvider>
							<AppNavigator />
						</BasketProvider>
					</PartyProvider>
				</AuthProvider>
			</ActionSheetProvider>
		</SafeAreaProvider>
	);
}

