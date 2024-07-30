import React, { useState, useContext, useEffect } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Button,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import colors from "../utils/styles/appStyles";
import { AuthContext } from "../context/authContext";
import { Formik } from "formik";
import * as Yup from "yup";

const Login = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { login, isLoading, loginError } = useContext(AuthContext);

  const validationSchema = Yup.object().shape({
    email: Yup.string().email("Invalid email").required("Email is required"),
    password: Yup.string()
      .min(6, "Password must be at least 6 characters")
      .required("Password is required"),
  });

  const handleSimpleLogin = async (values) => {
    await login(values.email, values.password, navigation);
  };

  return (
    <Formik
      initialValues={{ email: "", password: "" }}
      validationSchema={validationSchema}
      onSubmit={handleSimpleLogin}
      style={styles.container}
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
          <View style={styles.header}>
            <Text style={styles.headerText}>Login to Scerv</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={values.email}
                onChangeText={handleChange("email")}
                onBlur={handleBlur("email")}
                placeholder="Enter your email"
                autoCapitalize="none"
              />
            </View>
            {errors.email && touched.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={values.password}
                onChangeText={handleChange("password")}
                placeholder="Password"
                secureTextEntry={true}
                onBlur={handleBlur("password")}
                textContentType={"password"} // Helps with autofill
              />
            </View>
            {errors.password && touched.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
            {isLoading && <ActivityIndicator size="large" />}
            {(errors.general || loginError) && (
              <Text style={styles.errorText}>
                {errors.general || loginError}
              </Text>
            )}
            <Button
              title="Login"
              onPress={handleSubmit}
              style={styles.button}
              disabled={isLoading}
            />
            <TouchableOpacity
              onPress={() => navigation.navigate("PasswordReset")}
            >
              <Text style={styles.forgotPasswordLink}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Formik>
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
    width: 200,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
  },
  errorText: {
    color: "red", // Red is a common color for error messages
    fontWeight: "bold", // Make the text stand out
    textAlign: "center", // Center the error message

    marginBottom: 10, // Add some spacing below the error message
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
  forgotPasswordLink: {
    color: colors.primary, // Or any color you prefer for links
    marginTop: 10,
    textAlign: "center",
  },
});

export default Login;
