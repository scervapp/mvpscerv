import React, { createContext, useState, useEffect } from "react";
import { app, auth } from "../config/firebase";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  setDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthContext = createContext({
  currentUser: null,
  isLoading: false,
});

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);

  const db = getFirestore(app);

  // Useeffect hook to listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoading(true);

      // update the currentUserData if the user is authenticated

      // Update currentUserData if the user is authenticated
      if (user) {
        try {
          setCurrentUser(user);
          const customerDoc = await getDoc(doc(db, "customers", user.uid));
          const restaurantDo = await getDoc(doc(db, "restaurants", user.uid));
          let userData;
          if (customerDoc.exists()) {
            userData = { ...customerDoc.data(), uid: user.uid };
          } else if (restaurantDo.exists()) {
            userData = { ...restaurantDo.data(), uid: user.uid };
          }

          setCurrentUserData(userData);
        } catch (error) {
          console.log("Error fetching user data", error);
        }
      } else {
        setCurrentUser(null);
        setCurrentUserData(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email, password, navigation) => {
    setIsLoading(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password).then();

      // Parallel checks
      const customerDocRef = doc(db, "customers", auth.currentUser.uid);
      const restaurantDocRef = doc(db, "restaurants", auth.currentUser.uid);
      const [customerDoc, restaurantDoc] = await Promise.all([
        getDoc(customerDocRef),
        getDoc(restaurantDocRef),
      ]);

      let userData;

      if (customerDoc.exists()) {
        userData = { ...customerDoc.data(), uid: auth.currentUser.uid };
      } else if (restaurantDoc.exists()) {
        userData = { ...restaurantDoc.data(), uid: auth.currentUser.uid };
      }

      setCurrentUserData(userData);

      // Navigation Logic
      if (userData.role === "customer") {
        navigation.navigate("CustomerHome");
      } else if (userData.role === "restaurant") {
        navigation.navigate("RestaurantHome");
      }
    } catch (error) {
      if (
        error.code === "auth/invalid-email" ||
        error.code === "auth/invalid-password"
      ) {
        setLoginError("Invalid Credentials");
      } else if (error.code === "auth/user-not-found") {
        setLoginError("User not found");
      } else {
        setLoginError("An error occurred during login. Please try again.");
        console.log(" Error logging in ", error);
      }

      //console.error("Error logging in:", error); // Log the error for debugging
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email,
    password,
    additionalUserData,
    role,
    navigation
  ) => {
    setIsLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      console.log("Signup Successful");
      const collectionName =
        role === "restaurant" ? "restaurants" : "customers";
      await setDoc(doc(db, collectionName, user.uid), {
        email,
        role,
        ...additionalUserData,
      });

      if (role === "customer") {
        console.log("Customer Dashboard");
        navigation.navigate("CustomerHome");
      } else if (role === "restaurant") {
        console.log("Restaurant Home");
        navigation.navigate("RestaurantHome");
      }
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        throw new Error("Email is already in use");
      } else if (error.code === "auth/invalid-email") {
        throw new Error("Invalid email address");
      } else if (error.code === "auth/weak-password") {
        throw new Error("Password should be at least 6 characters");
      } else {
        throw new Error("An error occurred during signup. Please try again."); // General error
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordResetEmail = async (email) => {
    try {
      setIsLoading(true);
      await sendPasswordResetEmail(auth, email);
      console.log("Password reset email sent successfully");
    } catch (error) {
      console.log("Error sending password reset email", error);
      // Handle errors appropriately, providing user-friendly messages
      if (error.code === "auth/invalid-email") {
        setLoginError("Invalid email address");
      } else if (error.code === "auth/user-not-found") {
        setLoginError("User not found");
      } else {
        setLoginError("An error occurred. Please try again later.");
      }
    } finally {
      setIsLoading(false); // Hide loading indicator (if used)
    }
  };

  const updateUserProfile = async (userId, profileData) => {
    setIsLoading(true);
    try {
      await firebase
        .firestore()
        .collection("users")
        .doc(userId)
        .update(profileData);
      console.log("Profile updated successfully");
    } catch (error) {
      console.log("Could not update profile", error);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (navigation) => {
    try {
      setIsLoading(true);
      await signOut(auth).then(() => {
        setCurrentUser(null);
        navigation.navigate("Login");
      });
    } catch (error) {
      console.log("Logout Error", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        signup,
        logout,
        currentUserData,
        loginError,
        sendPasswordResetEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export { AuthContext, AuthProvider };
