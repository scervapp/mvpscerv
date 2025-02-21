import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./styles/Unauthorized.css";

const Unauthorized = () => {
	const navigate = useNavigate();

	const goBack = () => {
		navigate(-1); // Go back to the previous page
	};

	return (
		<div className="unauthorized-container">
			<h1>Unauthorized Access</h1>
			<p>
				You do not have permission to view this page. This could be because:
			</p>
			<ul>
				<li>You are not signed in.</li>
				<li>You do not have the required role (e.g., administrator).</li>
			</ul>
			<p>Please try one of the following:</p>
			<div className="unauthorized-actions">
				<Link to="/signin" className="unauthorized-button">
					Sign In
				</Link>
				<button onClick={goBack} className="unauthorized-button">
					Go Back
				</button>
			</div>
			{/*  <p>
                If you believe you should have access, please contact
                <a href="mailto:support@example.com">support@example.com</a>.
            </p> */}
		</div>
	);
};

export default Unauthorized;
