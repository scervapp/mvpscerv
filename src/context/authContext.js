import React, { createContext, useState, useEffect } from "react";
import { app } from "../config/firebase";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
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
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUserData, setCurrentUserData] = useState(null);

  const auth = getAuth(app);
  const db = getFirestore(app);

  // Load authentication token from asyncstorage on app start
  useEffect(() => {
    setIsLoading(true);
    const loadAuthState = async () => {
      const authToken = await AsyncStorage.getItem("authToken");
      if (authToken) {
        setCurrentUser(authToken);
      }
      setIsLoading(false);
    };
    loadAuthState();
  }, [AsyncStorage]);

  const initializeAuthListener = () => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsLoading(false);
    });
    return unsubscribe;
  };

  // See if the users auth status is changed
  useEffect(() => {
    initializeAuthListener();
  }, [currentUser]);

  // Save authenthentication tooken to AsyncStorage
  const saveAuthTokenToStorage = async (token) => {
    try {
      await AsyncStorage.setItem("authToken", token);
    } catch (error) {
      console.log("Error saving authentication", error);
    }
  };

  const login = async (email, password, navigation) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password).then();

      // Parallel checks
      const customerDocRef = doc(db, "customers", auth.currentUser.uid);
      const restaurantDocRef = doc(db, "restaurants", auth.currentUser.uid);
      const [customerDoc, restaurantDoc] = await Promise.all([
        getDoc(customerDocRef),
        getDoc(restaurantDocRef),
      ]);

      console.log("Login Successful");

      if (customerDoc.exists()) {
        const userData = {
          uid: auth.currentUser.uid,
          ...customerDoc.data(),
        };
        console.log(userData);
        setCurrentUserData(userData);
        saveAuthTokenToStorage(userData.uid);
        if (userData.role === "customer") {
          navigation.navigate("CustomerHome");
        }
      } else if (restaurantDoc.exists()) {
        const userData = {
          uid: auth.currentUser.uid,
          ...restaurantDoc.data(),
        };
        console.log(userData);
        setCurrentUserData(userData);
        saveAuthTokenToStorage(userData.uid);
        if (userData.role === "restaurant") {
          navigation.navigate("RestaurantHome");
        }
      }
    } catch (error) {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(errorCode, errorMessage);
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
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(errorCode, errorMessage);
    } finally {
      setIsLoading(false);
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
      value={{ currentUser, isLoading, login, signup, logout, currentUserData }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export { AuthContext, AuthProvider };
