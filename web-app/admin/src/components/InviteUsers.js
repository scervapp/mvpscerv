import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import HandleInvite from "./HandleInvite";

const InviteUsers = () => {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false); // To track if the invite was sent
	const [error, setError] = useState(null); // To display any errors

	const sendInvite = httpsCallable(functions, "sendInvite");
	const setAdminClaim = httpsCallable(functions, "setAdminClaim");

	const handleInvite = async () => {
		try {
			await sendInvite({ email });

			setSent(true); // Update state to indicated successful invite
			setEmail(""); // Clear the email input field")
		} catch (error) {
			console.error(error);
			setError(error.message);
		}
	};

	return (
		<div>
			<h2>Invite Users</h2>
			{sent ? (
				<p>Invitation sent successfully!</p>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleInvite();
					}}
				>
					{" "}
					{/* Prevent default form submission */}
					<input
						type="email"
						placeholder="Employee Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<button type="submit">Send Invite</button> {/* Submit button */}
				</form>
			)}
			{error && <p className="error">{error}</p>}{" "}
			{/* Display error message if any */}
		</div>
	);
};

export default InviteUsers;
