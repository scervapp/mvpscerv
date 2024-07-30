import React, { useState, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Formik } from "formik";
import * as Yup from "yup";

import colors from "../../utils/styles/appStyles";
import { Button } from "react-native-elements"; // Example using react-native-elements for buttons
import { AuthContext } from "../../context/authContext";

const PasswordResetScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const { sendPasswordResetEmail, isLoading, loginError } =
    useContext(AuthContext);

  const validationSchema = Yup.object().shape({
    email: Yup.string().email("Invalid email").required("Email is required"),
  });

  const handlePasswordReset = async (values) => {
    try {
      console.log("Working...", values.email);
      //await sendPasswordResetEmail(values.email);
      Alert.alert("Success", "Password reset email sent."); // Optional success message
      navigation.goBack(); // Go back to login screen
    } catch (error) {
      // No need to handle here, it should be handled in the context
      console.log("Could not reset password ", error);
    }
  };

  return (
    <Formik
      initialValues={{ email: "" }}
      validationSchema={validationSchema}
      onSubmit={handlePasswordReset}
    >
      {({
        handleChange,
        handleBlur,
        handleSubmit,
        values,
        errors,
        touched,
      }) => (
        <View style={styles.container}>
          <Text style={styles.title}>Reset Password</Text>
          {loginError && <Text style={styles.errorText}>{loginError}</Text>}

          <TextInput
            placeholder="Email"
            onChangeText={handleChange("email")}
            onBlur={handleBlur("email")}
            value={values.email}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          {errors.email && touched.email && (
            <Text style={styles.errorText}>{errors.email}</Text>
          )}

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Button title="Reset Password" onPress={handleSubmit} />
          )}
        </View>
      )}
    </Formik>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: colors.background, // Use your app's background color
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: colors.primary, // Or any color that fits your design
    textAlign: "center",
  },
  input: {
    height: 40,
    borderColor: colors.primary, // Use your primary color for borders
    borderWidth: 1,
    marginBottom: 15,
    padding: 10,
    borderRadius: 5, // Slightly rounded corners
  },
  button: {
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
  errorText: {
    color: "red",
    marginBottom: 10,
    textAlign: "center",
  },
});

export default PasswordResetScreen;
