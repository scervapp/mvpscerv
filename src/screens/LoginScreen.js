import React, { useState, useContext } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Button,
  Text,
  ActivityIndicator,
} from "react-native";
import colors from "../utils/styles/appStyles";
import { AuthContext } from "../context/authContext";

const Login = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const { login, isLoading } = useContext(AuthContext);

  const handleSimpleLogin = async () => {
    // Perform simple login logic here

    // ...
    await login(username, password, navigation);
    // Simulate successful login
    setLoginError("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Login to Scerv</Text>
      </View>
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email or Phone Number</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your email or phone number"
            textContentType={"username"} // Helps with autofill
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={true}
            textContentType={"password"} // Helps with autofill
          />
        </View>

        <Button
          title="Login"
          onPress={handleSimpleLogin}
          style={styles.button}
          disabled={isLoading}
        />
      </View>
      {isLoading && <ActivityIndicator size="large" />}
      {loginError && <Text style={styles.errorText}>{loginError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 30,
    justifyContent: "center", // Center vertically
    alignItems: "center", // Center horizontally
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    color: colors.primary,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.inputBackground,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
  },
  errorText: {
    // ... add styles for error display
  },
  header: {
    marginBottom: 40, // Adjust spacing as desired
    alignItems: "center",
  },
  headerText: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
  },
});

export default Login;
