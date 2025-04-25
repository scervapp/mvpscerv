import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { AuthProvider } from "./src/context/authContext";
import { BasketProvider } from "./src/context/customer/BasketContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { PartyProvider } from "./src/context/customer/PartyContext";

export default function App() {
	return (
		<ActionSheetProvider>
			<AuthProvider>
				<PartyProvider>
					<BasketProvider>
						<AppNavigator />
					</BasketProvider>
				</PartyProvider>
			</AuthProvider>
		</ActionSheetProvider>
	);
}

