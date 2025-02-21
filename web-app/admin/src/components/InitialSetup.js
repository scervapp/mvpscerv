import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const InitialSetup = () => {
	const [message, setMessage] = useState("");

	const setInitialClaim = async () => {
		const setAdminClaim = httpsCallable(functions, "setAdminClaim");

		try {
			const result = await setAdminClaim({
				uid: "6gSxhe3WJRXBU6Ps4DZLzal3Iz42", // Replace with your actual user's UID
				role: "godmode",
			});

			setMessage(result.data.message || "Claim set successfully!"); // Ensure a fallback message
		} catch (error) {
			setMessage(`Error: ${error.message}`);
		}
	};

	return (
		<div>
			<h1>Initial Setup</h1>
			<button onClick={setInitialClaim}>Set Godmode Claim</button>
			{message && <p>{message}</p>}
		</div>
	);
};

export default InitialSetup;
