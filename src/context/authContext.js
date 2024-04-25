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

  const login = async (email, password, navigation) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password).then();

      console.log("Login Successful");
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = {
          uid: auth.currentUser.uid,
          ...userDoc.data(),
        };
        console.log(userData);
        setCurrentUserData(userData);
        if (userData.role === "restaurant") {
          navigation.navigate("RestaurantDashboard");
        } else if (userData.role === "customer") {
          navigation.navigate("CustomerDashboard");
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
      await setDoc(doc(db, "users", user.uid), {
        email,
        role,
        ...additionalUserData,
      });

      if (role === "customer") {
        navigation.navigate("CustomerDashboard");
      } else if (role === "restaurant") {
        navigation.navigate("RestaurantDashboard");
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
