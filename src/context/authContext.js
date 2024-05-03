import React, { createContext, useState, useEffect } from "react";
import { app, auth } from "../config/firebase";
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
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
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
