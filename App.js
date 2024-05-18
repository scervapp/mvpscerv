import { AuthProvider } from "./src/context/authContext";
import { BasketProvider } from "./src/context/customer/BasketContext";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <AuthProvider>
      <BasketProvider>
        <AppNavigator />
      </BasketProvider>
    </AuthProvider>
  );
}
