import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/CreateRestaurant.css";

const emptyForm = {
	restaurantName: "",
	firstName: "",
	lastName: "",
	email: "",
	phoneNumber: "",
	address: "",
	area: "",
	city: "",
	state: "",
	zipcode: "",
	countryCode: "US",
	country: "United States",
	cuisineType: "",
	description: "",
	taxRate: "0",
	website: "",
	isActive: true,
	isLive: false,
	isTestAccount: true,
	emailOwner: true,
	reservations: false,
	reservationWaitlist: false,
	hostCheckInRequests: false,
	reviews: true,
	rewards: false,
};

const CreateRestaurant = () => {
	const [form, setForm] = useState(emptyForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState(null);
	const navigate = useNavigate();

	const updateField = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setResult(null);

		if (
			!form.restaurantName ||
			!form.firstName ||
			!form.lastName ||
			!form.email ||
			!form.phoneNumber ||
			!form.address ||
			!form.city ||
			!form.state ||
			!form.zipcode
		) {
			setError("Fill in the required restaurant and owner fields.");
			return;
		}

		setLoading(true);
		try {
			const createRestaurant = httpsCallable(
				functions,
				"createScervRestaurantOnboarding",
			);
			const response = await createRestaurant({
				emailOwner: form.emailOwner,
				owner: {
					firstName: form.firstName,
					lastName: form.lastName,
					email: form.email,
					phoneNumber: form.phoneNumber,
				},
				restaurant: {
					restaurantName: form.restaurantName,
					phoneNumber: form.phoneNumber,
					address: form.address,
					area: form.area,
					city: form.city,
					state: form.state,
					zipcode: form.zipcode,
					countryCode: form.countryCode,
					country: form.country,
					cuisineType: form.cuisineType,
					description: form.description,
					taxRate: Number(form.taxRate || 0),
					website: form.website,
					isActive: form.isActive,
					isLive: form.isLive,
					isTestAccount: form.isTestAccount,
					featureEntitlements: {
						reservations: form.reservations,
						reservationWaitlist: form.reservationWaitlist,
						hostCheckInRequests: form.hostCheckInRequests,
						reviews: form.reviews,
						rewards: form.rewards,
					},
				},
			});
			setResult(response.data);
		} catch (err) {
			console.error("Restaurant onboarding failed:", err);
			setError(err.message || "Restaurant onboarding failed.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="create-restaurant-container">
			<div className="create-restaurant-header">
				<div>
					<Link to="/restaurants">Back to restaurants</Link>
					<h1>Create Restaurant</h1>
					<p>Create the owner account, restaurant profile, defaults, and setup email.</p>
				</div>
			</div>

			{error && <p className="create-restaurant-error">{error}</p>}
			{result && (
				<section className="create-restaurant-result">
					<h2>Restaurant Created</h2>
					<p>
						Owner account is ready. Email sent:{" "}
						<strong>{result.emailSent ? "Yes" : "No"}</strong>
					</p>
					{result.emailWarning && <p>{result.emailWarning}</p>}
					<label>
						Setup link
						<textarea readOnly value={result.resetLink || ""} />
					</label>
					<div className="create-restaurant-actions">
						<button
							type="button"
							onClick={() => navigate(`/restaurants/${result.restaurantId}`)}
						>
							Open Restaurant
						</button>
						<button type="button" onClick={() => setForm(emptyForm)}>
							Create Another
						</button>
					</div>
				</section>
			)}

			<form className="create-restaurant-form" onSubmit={handleSubmit}>
				<section>
					<h2>Restaurant</h2>
					<label>
						Restaurant name *
						<input
							value={form.restaurantName}
							onChange={(event) =>
								updateField("restaurantName", event.target.value)
							}
						/>
					</label>
					<div className="create-restaurant-grid">
						<label>
							Cuisine
							<input
								value={form.cuisineType}
								onChange={(event) =>
									updateField("cuisineType", event.target.value)
								}
							/>
						</label>
						<label>
							Tax rate
							<input
								type="number"
								step="0.0001"
								value={form.taxRate}
								onChange={(event) => updateField("taxRate", event.target.value)}
							/>
						</label>
					</div>
					<label>
						Description
						<textarea
							value={form.description}
							onChange={(event) =>
								updateField("description", event.target.value)
							}
						/>
					</label>
				</section>

				<section>
					<h2>Owner</h2>
					<div className="create-restaurant-grid">
						<label>
							First name *
							<input
								value={form.firstName}
								onChange={(event) =>
									updateField("firstName", event.target.value)
								}
							/>
						</label>
						<label>
							Last name *
							<input
								value={form.lastName}
								onChange={(event) => updateField("lastName", event.target.value)}
							/>
						</label>
						<label>
							Email *
							<input
								type="email"
								value={form.email}
								onChange={(event) => updateField("email", event.target.value)}
							/>
						</label>
						<label>
							Phone *
							<input
								value={form.phoneNumber}
								onChange={(event) =>
									updateField("phoneNumber", event.target.value)
								}
							/>
						</label>
					</div>
				</section>

				<section>
					<h2>Address</h2>
					<label>
						Street address *
						<input
							value={form.address}
							onChange={(event) => updateField("address", event.target.value)}
						/>
					</label>
					<label>
						Area
						<input
							value={form.area}
							onChange={(event) => updateField("area", event.target.value)}
						/>
					</label>
					<div className="create-restaurant-grid">
						<label>
							City *
							<input
								value={form.city}
								onChange={(event) => updateField("city", event.target.value)}
							/>
						</label>
						<label>
							State *
							<input
								value={form.state}
								onChange={(event) => updateField("state", event.target.value)}
							/>
						</label>
						<label>
							Zip code *
							<input
								value={form.zipcode}
								onChange={(event) => updateField("zipcode", event.target.value)}
							/>
						</label>
						<label>
							Country code
							<select
								value={form.countryCode}
								onChange={(event) => {
									const code = event.target.value;
									updateField("countryCode", code);
									updateField("country", code === "PA" ? "Panama" : "United States");
								}}
							>
								<option value="US">United States</option>
								<option value="PA">Panama</option>
							</select>
						</label>
					</div>
				</section>

				<section>
					<h2>Controls</h2>
					<div className="create-restaurant-toggles">
						{[
							["isActive", "Active"],
							["isLive", "Visible/live"],
							["isTestAccount", "Use Stripe test mode"],
							["emailOwner", "Email setup link"],
							["reservations", "Reservations"],
							["reservationWaitlist", "Waitlist"],
							["hostCheckInRequests", "Host check-in"],
							["reviews", "Reviews"],
							["rewards", "Rewards"],
						].map(([field, label]) => (
							<label key={field}>
								<input
									type="checkbox"
									checked={Boolean(form[field])}
									onChange={(event) =>
										updateField(field, event.target.checked)
									}
								/>
								{label}
							</label>
						))}
					</div>
				</section>

				<button type="submit" disabled={loading}>
					{loading ? "Creating..." : "Create Restaurant"}
				</button>
			</form>
		</div>
	);
};

export default CreateRestaurant;
