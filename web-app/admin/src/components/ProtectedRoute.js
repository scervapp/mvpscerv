import { Navigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../config/firebase";
import { getIdTokenResult } from "firebase/auth";
import { useEffect, useState } from "react";

const ProtectedRoute = ({ children, requiredRole }) => {
	// accept an array of roles
	const [user, loading] = useAuthState(auth);
	const [userRole, setUserRole] = useState(null);
	const [roleChecked, setRoleChecked] = useState(false);

	useEffect(() => {
		const checkUserRole = async () => {
			if (user) {
				try {
					const idTokenResult = await getIdTokenResult(user);
					setUserRole(idTokenResult.claims.role);
				} catch (error) {
					console.error("Error fetching user role", error);
				} finally {
					setRoleChecked(true);
				}
			} else {
				setRoleChecked(true);
			}
		};

		if (user && !roleChecked) {
			checkUserRole();
		}
	}, [user, roleChecked]);

	if (loading || (user && !roleChecked)) {
		return <div>Loading...</div>;
	}

	if (!user) {
		return <Navigate to="/signin" replace />; // Reidrect to sign-in if not authenticated
	}

	if (requiredRole) {
		if (
			requiredRole === "admin" &&
			(userRole === "admin" || userRole === "godmode")
		) {
			return children; // Allow access for admin or godmode
		} else if (requiredRole === "godmode" && userRole !== "godmode") {
			return <Navigate to="/unauthorized" replace />; // Only godmode allowed
		} else if (requiredRole !== "admin" && requiredRole !== "godmode") {
			console.error("Incorrect Role");
			return <Navigate to="/unauthorized" replace />;
		} else if (userRole !== requiredRole) {
			return <Navigate to="/unauthorized" replace />;
		}
	}
	return children; // Render the protected component if authenticated
};

export default ProtectedRoute;
