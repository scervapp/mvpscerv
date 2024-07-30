import React, { useState, useContext } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Button,
  Label,
  ActivityIndicator,
} from "react-native";
import colors from "../../utils/styles/appStyles";
import { AuthContext } from "../../context/authContext";

const CustomerSignup = ({ navigation }) => {
  // State variables for all attributes
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupError, setSignupError] = useState("");

  // ... State variables for your custom attributes
  const { signup, isLoading } = useContext(AuthContext);

  const handleSignupSubmit = async () => {
    try {
      await signup(
        email,
        password,
        { firstName, lastName, phoneNumber },
        "customer",
        navigation
      );
    } catch (error) {
      setSignupError(error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Account</Text>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="youremail@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="John"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Johnson"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
          />
        </View>

        {/* ... Input fields for custom attributes */}
      </View>
      {isLoading && (
        <View>
          <ActivityIndicator size="large" />
        </View>
      )}
      {signupError && (
        <View style={styles.errorArea}>
          <Text style={styles.errorText}>{signupError}</Text>
        </View>
      )}
      <Button
        title="Sign Up"
        onPress={handleSignupSubmit}
        style={styles.button}
        disabled={isLoading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 30,
  },
  form: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 10,
    shadowColor: "#000", // Subtle shadow effect
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
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
    backgroundColor: colors.background, // Blend with the overall background
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
  },
  errorArea: {
    // ... Add styles for error display
  },
  errorText: {
    color: "red", // Red is a common color for error messages
    fontWeight: "bold", // Make the text stand out
    textAlign: "center", // Center the error message
    marginTop: 10, // Add some spacing above the error message
    marginBottom: 10, // Add some spacing below the error message
  },
});

export default CustomerSignup;
