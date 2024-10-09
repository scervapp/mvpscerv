import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { AuthProvider } from "./src/context/authContext";
import { BasketProvider } from "./src/context/customer/BasketContext";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
	return (
		<ActionSheetProvider>
			<AuthProvider>
				<BasketProvider>
					<AppNavigator />
				</BasketProvider>
			</AuthProvider>
		</ActionSheetProvider>
	);
}

