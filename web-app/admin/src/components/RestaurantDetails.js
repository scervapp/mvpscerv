import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/RestaurantDetails.css";

const RestaurantDetails = () => {
	const { id } = useParams();
	const [restaurant, setRestaurant] = useState(null);
	const [formData, setFormData] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isEditMode, setIsEditMode] = useState(false); // Track edit mode
	useEffect(() => {
		const fetchData = async () => {
			setLoading(true);
			setError(null);
			try {
				const getProfile = httpsCallable(functions, "getScervRestaurantProfile");
				const response = await getProfile({ restaurantId: id });
				const restaurantData = response.data?.restaurant;
				setRestaurant(restaurantData);
				setFormData(restaurantData); // Initialize form data
			} catch (err) {
				setError("Error fetching restaurant data.");
				console.error("Error fetching data:", err);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [id]);

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setFormData({
			...formData,
			[name]: type === "checkbox" ? checked : value,
		});
	};

	const handleEdit = () => {
		setIsEditMode(true);
	};

	const handleCancel = () => {
		setIsEditMode(false);
		setFormData(restaurant); // Reset form data to original values
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		// Input Validation
		if (
			!formData.restaurantName ||
			!formData.restaurantNumber ||
			!formData.address
		) {
			alert("Please fill in all required fields (Name, Store #, Address).");
			return;
		}
		if (isNaN(parseFloat(formData.restaurantNumber))) {
			alert("Store number needs to be a number");
			return;
		}

		if (isNaN(parseFloat(formData.taxRate))) {
			alert("Tax Rate needs to be a number");
			return;
		}

		if (!window.confirm("Are you sure you want to save changes?")) {
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const updatedData = {
				...formData,
				restaurantNumber: parseFloat(formData.restaurantNumber), // Ensure price is a number
				taxRate: parseFloat(formData.taxRate),
			};
			const updateProfile = httpsCallable(
				functions,
				"updateScervRestaurantProfile"
			);
			await updateProfile({ restaurantId: id, updates: updatedData });

			setRestaurant(updatedData); // Update the displayed restaurant data
			setIsEditMode(false);
			// Optionally display a success message (consider using a toast library)
		} catch (error) {
			setError("Error updating restaurant.");
			console.error("Error updating restaurant:", error);
			// Display an error message to the user
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return <div className="restaurant-details-container">Loading...</div>;
	}

	if (error) {
		return <div className="restaurant-details-container error">{error}</div>;
	}

	if (!restaurant) {
		return (
			<div className="restaurant-details-container">Restaurant not found</div>
		);
	}

	return (
		<div className="restaurant-details-container">
			<h2>
				{restaurant.restaurantName} - Store #{restaurant.restaurantNumber}
			</h2>
			<p>
				<Link to={`/restaurants/${id}/menu`}>Manage Menu</Link>
			</p>
			{isEditMode ? (
				<form onSubmit={handleSubmit}>
					{/* Input fields (editable) */}
					<div>
						<label htmlFor="restaurantNumber">Store #:</label>
						<input
							type="number"
							id="restaurantNumber"
							name="restaurantNumber"
							value={formData.restaurantNumber}
							onChange={handleChange}
							required
						/>
					</div>
					<div>
						<label htmlFor="restaurantName">Restaurant Name:</label>
						<input
							type="text"
							id="restaurantName"
							name="restaurantName"
							value={formData.restaurantName}
							onChange={handleChange}
							required
						/>
					</div>
					<div>
						<label htmlFor="address">Address:</label>
						<input
							type="text"
							id="address"
							name="address"
							value={formData.address}
							onChange={handleChange}
							required
						/>
					</div>
					<div>
						<label htmlFor="city">City:</label>
						<input
							type="text"
							id="city"
							name="city"
							value={formData.city}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="state">State:</label>
						<input
							type="text"
							id="state"
							name="state"
							value={formData.state}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="zipcode">Zip Code:</label>
						<input
							type="text"
							id="zipcode"
							name="zipcode"
							value={formData.zipcode}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="phoneNumber">Phone Number:</label>
						<input
							type="tel"
							id="phoneNumber"
							name="phoneNumber"
							value={formData.phoneNumber}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="email">Email:</label>
						<input
							type="email"
							id="email"
							name="email"
							value={formData.email}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="firstName">First Name:</label>
						<input
							type="text"
							id="firstName"
							name="firstName"
							value={formData.firstName}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="lastName">Last Name:</label>
						<input
							type="text"
							id="lastName"
							name="lastName"
							value={formData.lastName}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="cuisineType">Cuisine Type:</label>
						<input
							type="text"
							id="cuisineType"
							name="cuisineType"
							value={formData.cuisineType}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="description">Description:</label>
						<textarea
							id="description"
							name="description"
							value={formData.description}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="taxRate">Tax Rate:</label>
						<input
							type="number"
							step="0.0001"
							id="taxRate"
							name="taxRate"
							value={formData.taxRate}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="website">Website:</label>
						<input
							type="text"
							id="website"
							name="website"
							value={formData.website}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="imageUri">Profile Image URL:</label>
						<input
							type="text"
							id="imageUri"
							name="imageUri"
							value={formData.imageUri}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="geoLat">Latitude:</label>
						<input
							type="text"
							id="geoLat"
							name="geoLat"
							value={formData.geoLat}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="geoLong">Longitude:</label>
						<input
							type="text"
							id="geoLong"
							name="geoLong"
							value={formData.geoLong}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="isActive">Active:</label>
						<input
							type="checkbox"
							id="isActive"
							name="isActive"
							checked={formData.isActive}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="backOfficePin">Back Office PIN:</label>
						<input
							type="password"
							id="backOfficePin"
							name="backOfficePin"
							value={formData.backOfficePin || ""}
							onChange={handleChange}
						/>
					</div>
					<div>
						<label htmlFor="stripeAccountId">Stripe Account ID:</label>
						<input
							type="text"
							id="stripeAccountId"
							name="stripeAccountId"
							value={formData.stripeAccountId}
							onChange={handleChange}
							readOnly
						/>
					</div>
					<div>
						<label htmlFor="uid">User ID (UID):</label>
						<input
							type="text"
							id="uid"
							name="uid"
							value={formData.uid}
							onChange={handleChange}
							readOnly
						/>
					</div>
					<button type="submit" disabled={loading}>
						Save Changes
					</button>
					<button type="button" onClick={handleCancel} disabled={loading}>
						Cancel
					</button>
				</form>
			) : (
				<>
					{/* Display fields (read-only) */}
					<p>
						<strong>Store #:</strong> {restaurant.restaurantNumber}
					</p>
					<p>
						<strong>Restaurant Name:</strong> {restaurant.restaurantName}
					</p>
					<p>
						<strong>Address:</strong> {restaurant.address}
					</p>
					<p>
						<strong>City:</strong> {restaurant.city}
					</p>
					<p>
						<strong>State:</strong> {restaurant.state}
					</p>
					<p>
						<strong>Zip Code:</strong> {restaurant.zipcode}
					</p>
					<p>
						<strong>Phone Number:</strong> {restaurant.phoneNumber}
					</p>
					<p>
						<strong>Email:</strong> {restaurant.email}
					</p>
					<p>
						<strong>First Name:</strong> {restaurant.firstName}
					</p>
					<p>
						<strong>Last Name:</strong> {restaurant.lastName}
					</p>
					<p>
						<strong>Cuisine Type:</strong> {restaurant.cuisineType}
					</p>
					<p>
						<strong>Description:</strong> {restaurant.description}
					</p>
					<p>
						<strong>Tax Rate:</strong> {restaurant.taxRate}
					</p>
					<p>
						<strong>Website:</strong> {restaurant.website}
					</p>
					<p>
						<strong>Image URI:</strong> {restaurant.imageUri}
					</p>
					<p>
						<strong>Latitude:</strong> {restaurant.geoLat}
					</p>
					<p>
						<strong>Longitude:</strong> {restaurant.geoLong}
					</p>
					<p>
						<strong>Active:</strong> {restaurant.isActive ? "Yes" : "No"}
					</p>
					<p>
						<strong>Back Office PIN:</strong>{" "}
						{restaurant.backOfficePin ? "*******" : "Not Set"}
					</p>
					<p>
						<strong>Stripe Account ID:</strong> {restaurant.stripeAccountId}
					</p>
					<p>
						<strong>UID:</strong> {restaurant.uid}
					</p>

					<button onClick={handleEdit} disabled={loading}>
						Edit
					</button>
				</>
			)}
		</div>
	);
};

export default RestaurantDetails;
