// WelcomeScreen.test.js
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import WelcomeScreen from "../screens/WelcomeScreen";
import { AuthContext } from "../context/authContext"; // Import your AuthContext

describe("WelcomeScreen", () => {
  // Mock the navigation
  const navigation = { navigate: jest.fn() };

  it("renders correctly when user is not logged in", () => {
    const { getByText } = render(
      <AuthContext.Provider value={{ currentUser: null, isLoading: false }}>
        <WelcomeScreen navigation={navigation} />
      </AuthContext.Provider>
    );

    expect(getByText("Welcome to Scerv!")).toBeTruthy();
    expect(getByText("Sign Up")).toBeTruthy();
    expect(getByText("Log In")).toBeTruthy();
    expect(getByText("Restaurants? Go Here")).toBeTruthy();
  });

  it("renders correctly when user is logged in", () => {
    const { queryByText } = render(
      <AuthContext.Provider
        value={{ currentUser: { email: "test@example.com" }, isLoading: false }}
      >
        <WelcomeScreen navigation={navigation} />
      </AuthContext.Provider>
    );

    // Ensure signup and login buttons are not visible
    expect(queryByText("Sign Up")).toBeNull();
    expect(queryByText("Log In")).toBeNull();
  });

  it('navigates to CustomerSignup on "Sign Up" press', () => {
    const { getByText } = render(
      <AuthContext.Provider value={{ currentUser: null, isLoading: false }}>
        <WelcomeScreen navigation={navigation} />
      </AuthContext.Provider>
    );

    fireEvent.press(getByText("Sign Up"));
    expect(navigation.navigate).toHaveBeenCalledWith("CustomerSignup");
  });

  // Add similar tests for Login and RestaurantSignup buttons
});
