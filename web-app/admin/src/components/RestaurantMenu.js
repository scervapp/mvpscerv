import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/RestaurantMenu.css";

const RestaurantMenu = () => {
	// Function to create a new menu item template to prevent repeating code
	const getNewMenuItemTemplate = () => {
		return {
			name: "",
			description: "",
			price: "",
			category: "",
			imageUri: "",
			isActive: false,
			isDailySpecial: false,
			isFeatured: false,
		};
	};
	const { id } = useParams();
	const [menuItems, setMenuItems] = useState([]);
	const [newMenuItem, setNewMenuItem] = useState(getNewMenuItemTemplate()); // use template
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [editItemId, setEditItemId] = useState(null); // Track which item is being updated
	const [editFormData, setEditFormData] = useState({}); // Store form data forediting
	const [isAddingItem, setIsAddingItem] = useState(false); // Track if adding item

	useEffect(() => {
		const fetchMenuItems = async () => {
			setLoading(true);
			setError("");
			try {
				const getProfile = httpsCallable(functions, "getScervRestaurantProfile");
				const response = await getProfile({ restaurantId: id });
				const menuItemsData = (response.data?.menuItems || []).map((item) => ({
					...item,
					price:
						typeof item.price === "string" ? parseFloat(item.price) : item.price,
				}));
				setMenuItems(menuItemsData);
			} catch (err) {
				console.error("Error loading menu items:", err);
				setError("Failed to load menu items.");
			} finally {
				setLoading(false);
			}
		};
		fetchMenuItems();
	}, [id]);

	const handleAddItem = async () => {
		setLoading(true);
		try {
			// Basic Input Validation
			if (!newMenuItem.name || !newMenuItem.price || !newMenuItem.category) {
				alert("Please fill in all required fields.");
				return;
			}

			if (isNaN(parseFloat(newMenuItem.price))) {
				alert("Price must be a number.");
				return;
			}
			const saveMenuItem = httpsCallable(functions, "saveScervMenuItem");
			const response = await saveMenuItem({
				restaurantId: id,
				item: {
					...newMenuItem,
					price: parseFloat(newMenuItem.price),
				},
			});
			const savedItem = response.data?.menuItem || {
				...newMenuItem,
				id: response.data?.itemId,
				price: parseFloat(newMenuItem.price),
			};
			setMenuItems([
				...menuItems,
				{
					...savedItem,
					price:
						typeof savedItem.price === "string"
							? parseFloat(savedItem.price)
							: savedItem.price,
				},
			]);
			setNewMenuItem(getNewMenuItemTemplate()); // Clear the form
			setIsAddingItem(false);
		} catch (error) {
			console.error("Error adding menu item:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleEditItem = (item) => {
		setEditItemId(item.id);
		setEditFormData({ ...item });
	};

	const handleUpdateItem = async (itemId) => {
		setLoading(true);
		try {
			// Basic Input Validation (same as add)
			if (!editFormData.name || !editFormData.price || !editFormData.category) {
				alert("Please fill in all required fields (Name, Price, Category).");
				return;
			}
			if (isNaN(parseFloat(editFormData.price))) {
				alert("Price must be a number.");
				return;
			}

			const saveMenuItem = httpsCallable(functions, "saveScervMenuItem");
			const response = await saveMenuItem({
				restaurantId: id,
				itemId,
				item: {
					...editFormData,
					price: parseFloat(editFormData.price),
				},
			});
			const savedItem = response.data?.menuItem || {
				...editFormData,
				id: itemId,
				price: parseFloat(editFormData.price),
			};

			setMenuItems(
				menuItems.map((item) =>
					item.id === itemId
						? {
								...item,
								...savedItem,
								price:
									typeof savedItem.price === "string"
										? parseFloat(savedItem.price)
										: savedItem.price,
						  }
						: item
				)
			);
			setEditItemId(null); // Exit edit mode
			setEditFormData({}); //Clear form
		} catch (error) {
			console.error("Error updating document: ", error);
			// Display an error message to the user
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteItem = async (itemId) => {
		if (!window.confirm("Archive this item and preserve its review history?")) {
			return;
		}

		setLoading(true);
		try {
			const archiveMenuItem = httpsCallable(functions, "archiveScervMenuItem");
			await archiveMenuItem({ restaurantId: id, itemId });
			setMenuItems(
				menuItems.map((item) =>
					item.id === itemId
						? { ...item, isActive: false, isArchived: true }
						: item
				)
			);
		} catch (error) {
			console.error("Error archiving menu item:", error);
			// Display an error message to the user
		} finally {
			setLoading(false);
		}
	};

	const handleInputChange = (e, itemId) => {
		const { name, value, type, checked } = e.target;

		if (itemId) {
			// Editing an existing item
			setEditFormData({
				...editFormData,
				[name]: type === "checkbox" ? checked : value,
			});
		} else {
			//Adding a new Item
			setNewMenuItem({
				...newMenuItem,
				[name]: type === "checkbox" ? checked : value,
			});
		}
	};

	const handleCancelEdit = () => {
		setEditItemId(null);
		setEditFormData({});
	};

	const handleCancelAddItem = () => {
		setIsAddingItem(false);
		setNewMenuItem(getNewMenuItemTemplate());
	};
	return (
		<div className="restaurant-menu-container">
			<h2>Manage Menu Items</h2>
			{error && <p className="error">{error}</p>}

			<button
				className="add-item-button"
				onClick={() => setIsAddingItem(true)}
				disabled={loading}
			>
				Add New Item
			</button>

			{isAddingItem && (
				<div className="add-item-form">
					<h3>Add New Item</h3>
					<input
						type="text"
						name="name"
						placeholder="Name"
						value={newMenuItem.name}
						onChange={(e) => handleInputChange(e)}
					/>
					<input
						type="text"
						name="description"
						placeholder="Description"
						value={newMenuItem.description}
						onChange={(e) => handleInputChange(e)}
					/>
					<input
						type="text"
						name="price"
						placeholder="Price"
						value={newMenuItem.price}
						onChange={(e) => handleInputChange(e)}
					/>
					<input
						type="text"
						name="category"
						placeholder="Category"
						value={newMenuItem.category}
						onChange={(e) => handleInputChange(e)}
					/>
					<input
						type="text"
						name="imageUri"
						placeholder="Image URI"
						value={newMenuItem.imageUri}
						onChange={(e) => handleInputChange(e)}
					/>
					<label>
						<input
							type="checkbox"
							name="isActive"
							checked={newMenuItem.isActive}
							onChange={(e) => handleInputChange(e)}
						/>
						Active
					</label>
					<label>
						<input
							type="checkbox"
							name="isDailySpecial"
							checked={newMenuItem.isDailySpecial}
							onChange={(e) => handleInputChange(e)}
						/>
						Daily Special
					</label>
					<label>
						<input
							type="checkbox"
							name="isFeatured"
							checked={newMenuItem.isFeatured}
							onChange={(e) => handleInputChange(e)}
						/>
						Featured
					</label>
					<button onClick={handleAddItem} disabled={loading}>
						Save New Item
					</button>
					<button onClick={handleCancelAddItem} disabled={loading}>
						Cancel
					</button>
				</div>
			)}

			{loading ? (
				<div>Loading...</div>
			) : (
				<table className="menu-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Description</th>
							<th>Price</th>
							<th>Category</th>
							<th>Image</th>
							<th>Active</th>
							<th>Archived</th>
							<th>Special</th>
							<th>Featured</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{menuItems.map((item) => (
							<tr key={item.id}>
								{editItemId === item.id ? (
									<>
										<td>
											<input
												type="text"
												name="name"
												value={editFormData.name}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="text"
												name="description"
												value={editFormData.description}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="text"
												name="price"
												value={editFormData.price}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="text"
												name="category"
												value={editFormData.category}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="text"
												name="imageUri"
												value={editFormData.imageUri}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="checkbox"
												name="isActive"
												checked={editFormData.isActive}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>{editFormData.isArchived ? "Yes" : "No"}</td>
										<td>
											<input
												type="checkbox"
												name="isDailySpecial"
												checked={editFormData.isDailySpecial}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>
										<td>
											<input
												type="checkbox"
												name="isFeatured"
												checked={editFormData.isFeatured}
												onChange={(e) => handleInputChange(e, item.id)}
											/>
										</td>

										<td>
											<button
												onClick={() => handleUpdateItem(item.id)}
												disabled={loading}
											>
												Save
											</button>
											<button onClick={handleCancelEdit} disabled={loading}>
												Cancel
											</button>
										</td>
									</>
								) : (
									<>
										<td>{item.name}</td>
										<td>{item.description}</td>
										<td>${Number(item.price || 0).toFixed(2)}</td>
										<td>{item.category}</td>
										<td>
											{item.imageUri ? (
												<img
													src={item.imageUri}
													alt={item.name}
													className="menu-item-image"
												/>
											) : (
												"No Image"
											)}
										</td>
										<td>{item.isActive ? "Yes" : "No"}</td>
										<td>{item.isArchived ? "Yes" : "No"}</td>
										<td>{item.isDailySpecial ? "Yes" : "No"}</td>
										<td>{item.isFeatured ? "Yes" : "No"}</td>
										<td>
											<button
												onClick={() => handleEditItem(item)}
												disabled={loading}
											>
												Edit
											</button>
											<button
												onClick={() => handleDeleteItem(item.id)}
												disabled={loading}
											>
												Archive
											</button>
										</td>
									</>
								)}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
};

export default RestaurantMenu;
