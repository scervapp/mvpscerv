import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/RestaurantMenu.css";

const commaFields = [
	"tags",
	"cuisineTags",
	"dietaryTags",
	"allergenTags",
	"flavorTags",
	"mealPeriodTags",
	"dishAliases",
	"ingredients",
];

const booleanFields = [
	"isActive",
	"isDailySpecial",
	"isFeatured",
	"isSignatureDish",
	"chefRecommended",
	"isVegetarian",
	"isVegan",
	"isGlutenFree",
	"containsAlcohol",
	"ageRestricted",
];

const getNewMenuItemTemplate = () => ({
	name: "",
	description: "",
	price: "",
	category: "",
	subcategory: "",
	menuSection: "",
	imageUri: "",
	thumbnailUri: "",
	mediaUrls: "",
	preparationStyle: "",
	popularityLabel: "",
	metadataNotes: "",
	spiceLevel: "0",
	sortOrder: "0",
	calories: "",
	tags: "",
	cuisineTags: "",
	dietaryTags: "",
	allergenTags: "",
	flavorTags: "",
	mealPeriodTags: "",
	dishAliases: "",
	ingredients: "",
	isActive: true,
	isDailySpecial: false,
	isFeatured: false,
	isSignatureDish: false,
	chefRecommended: false,
	isVegetarian: false,
	isVegan: false,
	isGlutenFree: false,
	containsAlcohol: false,
	ageRestricted: false,
});

const toCommaText = (value) => (Array.isArray(value) ? value.join(", ") : value || "");

const mediaToText = (media = []) =>
	Array.isArray(media)
		? media
				.map((item) =>
					typeof item === "string" ? item : item?.url || item?.imageUrl || "",
				)
				.filter(Boolean)
				.join("\n")
		: "";

const normalizeForForm = (item = {}) => ({
	...getNewMenuItemTemplate(),
	...item,
	price: item.price === undefined || item.price === null ? "" : String(item.price),
	spiceLevel: String(item.spiceLevel || 0),
	sortOrder: String(item.sortOrder || 0),
	calories: item.calories ? String(item.calories) : "",
	mediaUrls: mediaToText(item.media),
	...commaFields.reduce((acc, field) => {
		acc[field] = toCommaText(item[field]);
		return acc;
	}, {}),
});

const splitCommaList = (value) =>
	String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

const splitMediaUrls = (value) =>
	String(value || "")
		.split(/[\n,]+/)
		.map((item) => item.trim())
		.filter(Boolean);

const normalizeForSave = (form = {}) => {
	const payload = {
		...form,
		price: parseFloat(form.price),
		spiceLevel: Number(form.spiceLevel || 0),
		sortOrder: Number(form.sortOrder || 0),
		calories: Number(form.calories || 0),
	};
	const mediaUrls = splitMediaUrls(form.mediaUrls);
	payload.media = mediaUrls.map((url, index) => ({
		id: `admin_media_${index + 1}`,
		type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "photo",
		url,
		thumbnailUrl: url,
		source: "admin",
		status: "published",
	}));
	delete payload.mediaUrls;

	commaFields.forEach((field) => {
		payload[field] = splitCommaList(form[field]);
	});
	booleanFields.forEach((field) => {
		payload[field] = Boolean(form[field]);
	});

	return payload;
};

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const TagPreview = ({ items = [] }) => {
	const tags = Array.isArray(items) ? items : [];
	if (tags.length === 0) return <span className="muted">No tags</span>;

	return (
		<div className="tag-preview">
			{tags.slice(0, 6).map((tag) => (
				<span key={tag}>{tag}</span>
			))}
			{tags.length > 6 && <span>+{tags.length - 6}</span>}
		</div>
	);
};

const MenuItemForm = ({
	form,
	title,
	onChange,
	onSubmit,
	onCancel,
	loading,
}) => (
	<form className="menu-item-form" onSubmit={onSubmit}>
		<h3>{title}</h3>
		<div className="menu-form-grid">
			<label>
				Name
				<input
					name="name"
					value={form.name}
					onChange={onChange}
					placeholder="Crispy Calamari"
				/>
			</label>
			<label>
				Price
				<input
					name="price"
					type="number"
					step="0.01"
					value={form.price}
					onChange={onChange}
					placeholder="14.00"
				/>
			</label>
			<label>
				Category
				<input
					name="category"
					value={form.category}
					onChange={onChange}
					placeholder="Appetizers"
				/>
			</label>
			<label>
				Subcategory
				<input
					name="subcategory"
					value={form.subcategory}
					onChange={onChange}
					placeholder="Seafood"
				/>
			</label>
			<label>
				Menu section
				<input
					name="menuSection"
					value={form.menuSection}
					onChange={onChange}
					placeholder="Dinner"
				/>
			</label>
			<label>
				Preparation
				<input
					name="preparationStyle"
					value={form.preparationStyle}
					onChange={onChange}
					placeholder="Fried, grilled, raw, smoked"
				/>
			</label>
			<label className="wide-field">
				Description
				<textarea
					name="description"
					value={form.description}
					onChange={onChange}
					placeholder="Short customer-facing description"
				/>
			</label>
			<label>
				Image URI
				<input name="imageUri" value={form.imageUri} onChange={onChange} />
			</label>
			<label>
				Thumbnail URI
				<input
					name="thumbnailUri"
					value={form.thumbnailUri}
					onChange={onChange}
				/>
			</label>
			<label className="wide-field">
				Gallery media URLs
				<textarea
					name="mediaUrls"
					value={form.mediaUrls}
					onChange={onChange}
					placeholder="One image or video URL per line"
				/>
			</label>
			<label>
				Popularity label
				<input
					name="popularityLabel"
					value={form.popularityLabel}
					onChange={onChange}
					placeholder="House favorite"
				/>
			</label>
			<label>
				Spice level
				<select name="spiceLevel" value={form.spiceLevel} onChange={onChange}>
					<option value="0">0 - none</option>
					<option value="1">1 - mild</option>
					<option value="2">2</option>
					<option value="3">3 - medium</option>
					<option value="4">4</option>
					<option value="5">5 - hot</option>
				</select>
			</label>
			<label>
				Sort order
				<input
					name="sortOrder"
					type="number"
					value={form.sortOrder}
					onChange={onChange}
				/>
			</label>
			<label>
				Calories
				<input
					name="calories"
					type="number"
					value={form.calories}
					onChange={onChange}
				/>
			</label>
			<label>
				Discovery tags
				<input
					name="tags"
					value={form.tags}
					onChange={onChange}
					placeholder="crispy, shareable, seafood"
				/>
			</label>
			<label>
				Cuisine tags
				<input
					name="cuisineTags"
					value={form.cuisineTags}
					onChange={onChange}
					placeholder="Italian, Caribbean"
				/>
			</label>
			<label>
				Dietary tags
				<input
					name="dietaryTags"
					value={form.dietaryTags}
					onChange={onChange}
					placeholder="vegetarian, gluten free"
				/>
			</label>
			<label>
				Allergen tags
				<input
					name="allergenTags"
					value={form.allergenTags}
					onChange={onChange}
					placeholder="shellfish, dairy, nuts"
				/>
			</label>
			<label>
				Flavor tags
				<input
					name="flavorTags"
					value={form.flavorTags}
					onChange={onChange}
					placeholder="spicy, savory, citrus"
				/>
			</label>
			<label>
				Meal periods
				<input
					name="mealPeriodTags"
					value={form.mealPeriodTags}
					onChange={onChange}
					placeholder="brunch, lunch, dinner"
				/>
			</label>
			<label>
				Aliases
				<input
					name="dishAliases"
					value={form.dishAliases}
					onChange={onChange}
					placeholder="squid, calamari rings"
				/>
			</label>
			<label>
				Ingredients
				<input
					name="ingredients"
					value={form.ingredients}
					onChange={onChange}
					placeholder="squid, lemon, marinara"
				/>
			</label>
			<label className="wide-field">
				Internal metadata notes
				<textarea
					name="metadataNotes"
					value={form.metadataNotes}
					onChange={onChange}
					placeholder="Notes for Scerv/admin curation"
				/>
			</label>
		</div>
		<div className="menu-toggle-grid">
			{booleanFields.map((field) => (
				<label key={field}>
					<input
						type="checkbox"
						name={field}
						checked={Boolean(form[field])}
						onChange={onChange}
					/>
					{field}
				</label>
			))}
		</div>
		<div className="form-actions">
			<button type="submit" disabled={loading}>
				Save item
			</button>
			<button type="button" onClick={onCancel} disabled={loading}>
				Cancel
			</button>
		</div>
	</form>
);

const RestaurantMenu = () => {
	const { id } = useParams();
	const [menuItems, setMenuItems] = useState([]);
	const [newMenuItem, setNewMenuItem] = useState(getNewMenuItemTemplate());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [editItemId, setEditItemId] = useState("");
	const [editFormData, setEditFormData] = useState(getNewMenuItemTemplate());
	const [isAddingItem, setIsAddingItem] = useState(false);

	const loadMenuItems = async () => {
		setLoading(true);
		setError("");
		try {
			const getProfile = httpsCallable(functions, "getScervRestaurantProfile");
			const response = await getProfile({ restaurantId: id });
			const rows = (response.data?.menuItems || []).map((item) => ({
				...item,
				price: typeof item.price === "string" ? parseFloat(item.price) : item.price,
			}));
			setMenuItems(rows);
		} catch (err) {
			console.error("Error loading menu items:", err);
			setError("Failed to load menu items.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadMenuItems();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const sortedMenuItems = useMemo(
		() =>
			[...menuItems].sort((a, b) => {
				const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
				if (sortDiff !== 0) return sortDiff;
				return String(a.name || "").localeCompare(String(b.name || ""));
			}),
		[menuItems],
	);

	const validateForm = (form) => {
		if (!form.name || !form.price || !form.category) {
			setError("Name, price, and category are required.");
			return false;
		}
		if (Number.isNaN(parseFloat(form.price))) {
			setError("Price must be a number.");
			return false;
		}
		return true;
	};

	const saveItem = async ({ itemId, form }) => {
		if (!validateForm(form)) return;

		setLoading(true);
		setError("");
		setMessage("");
		try {
			const saveMenuItem = httpsCallable(functions, "saveScervMenuItem");
			const response = await saveMenuItem({
				restaurantId: id,
				itemId: itemId || null,
				item: normalizeForSave(form),
			});
			const savedItem = response.data?.menuItem;
			if (savedItem) {
				setMenuItems((current) => {
					const exists = current.some((item) => item.id === savedItem.id);
					if (!exists) return [...current, savedItem];
					return current.map((item) =>
						item.id === savedItem.id ? { ...item, ...savedItem } : item,
					);
				});
			} else {
				await loadMenuItems();
			}
			setMessage(itemId ? "Menu item updated." : "Menu item created.");
			setNewMenuItem(getNewMenuItemTemplate());
			setEditFormData(getNewMenuItemTemplate());
			setEditItemId("");
			setIsAddingItem(false);
		} catch (err) {
			console.error("Error saving menu item:", err);
			setError(err.message || "Failed to save menu item.");
		} finally {
			setLoading(false);
		}
	};

	const archiveItem = async (itemId) => {
		if (!window.confirm("Archive this item and preserve its review history?")) {
			return;
		}

		setLoading(true);
		setError("");
		setMessage("");
		try {
			const archiveMenuItem = httpsCallable(functions, "archiveScervMenuItem");
			await archiveMenuItem({ restaurantId: id, itemId });
			setMenuItems((current) =>
				current.map((item) =>
					item.id === itemId ? { ...item, isActive: false, isArchived: true } : item,
				),
			);
			setMessage("Menu item archived.");
		} catch (err) {
			console.error("Error archiving menu item:", err);
			setError(err.message || "Failed to archive menu item.");
		} finally {
			setLoading(false);
		}
	};

	const handleFormChange = (setter) => (event) => {
		const { name, value, type, checked } = event.target;
		setter((prev) => ({
			...prev,
			[name]: type === "checkbox" ? checked : value,
		}));
	};

	const beginEdit = (item) => {
		setEditItemId(item.id);
		setEditFormData(normalizeForForm(item));
		setIsAddingItem(false);
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<div className="restaurant-menu-container">
			<div className="menu-header">
				<div>
					<Link to={`/restaurants/${id}`}>Back to restaurant</Link>
					<h1>Menu Metadata Manager</h1>
					<p>
						Create menu items with the discovery fields Scerv needs for search,
						ratings, recommendations, and customer filtering.
					</p>
				</div>
				<button
					type="button"
					className="add-item-button"
					onClick={() => {
						setIsAddingItem(true);
						setEditItemId("");
					}}
					disabled={loading}
				>
					Add item
				</button>
			</div>

			{message && <p className="menu-message">{message}</p>}
			{error && <p className="menu-error">{error}</p>}

			{isAddingItem && (
				<MenuItemForm
					title="Add Menu Item"
					form={newMenuItem}
					onChange={handleFormChange(setNewMenuItem)}
					onSubmit={(event) => {
						event.preventDefault();
						saveItem({ form: newMenuItem });
					}}
					onCancel={() => {
						setIsAddingItem(false);
						setNewMenuItem(getNewMenuItemTemplate());
					}}
					loading={loading}
				/>
			)}

			{editItemId && (
				<MenuItemForm
					title="Edit Menu Item"
					form={editFormData}
					onChange={handleFormChange(setEditFormData)}
					onSubmit={(event) => {
						event.preventDefault();
						saveItem({ itemId: editItemId, form: editFormData });
					}}
					onCancel={() => {
						setEditItemId("");
						setEditFormData(getNewMenuItemTemplate());
					}}
					loading={loading}
				/>
			)}

			<section className="menu-list-panel">
				<div className="menu-list-header">
					<h2>Items</h2>
					<span>{sortedMenuItems.length} total</span>
				</div>
				{loading ? (
					<p>Loading...</p>
				) : (
					<table className="menu-table">
						<thead>
							<tr>
								<th>Item</th>
								<th>Metadata</th>
								<th>Tags</th>
								<th>Rating</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{sortedMenuItems.map((item) => (
								<tr key={item.id}>
									<td>
										<div className="item-title-cell">
											{item.imageUri ? (
												<img
													src={item.imageUri}
													alt={item.name}
													className="menu-item-image"
												/>
											) : (
												<div className="image-placeholder">No image</div>
											)}
											<div>
												<strong>{item.name}</strong>
												<span>{item.description || "No description"}</span>
												<small>{formatMoney(item.price)}</small>
												{Array.isArray(item.media) && item.media.length > 0 && (
													<small>{item.media.length} gallery media</small>
												)}
											</div>
										</div>
									</td>
									<td>
										<strong>{item.category || "--"}</strong>
										<span>{item.subcategory || item.menuSection || "--"}</span>
										<span>
											{item.preparationStyle || "--"}{" "}
											{item.spiceLevel ? `spice ${item.spiceLevel}/5` : ""}
										</span>
									</td>
									<td>
										<TagPreview
											items={[
												...(item.tags || []),
												...(item.cuisineTags || []),
												...(item.dietaryTags || []),
												...(item.flavorTags || []),
											]}
										/>
									</td>
									<td>
										<strong>
											{Number(item.averageRating || item.rating || 0).toFixed(1)}
										</strong>
										<span>
											{item.ratingCount || 0} ratings / {item.reviewCount || 0} reviews
										</span>
									</td>
									<td>
										<span className={item.isArchived ? "bad-pill" : "good-pill"}>
											{item.isArchived
												? "Archived"
												: item.isActive
													? "Active"
													: "Inactive"}
										</span>
										{item.isFeatured && <span className="neutral-pill">Featured</span>}
										{item.isSignatureDish && (
											<span className="neutral-pill">Signature</span>
										)}
									</td>
									<td>
										<div className="row-actions">
											<button
												type="button"
												onClick={() => beginEdit(item)}
												disabled={loading}
											>
												Edit
											</button>
											<button
												type="button"
												className="danger"
												onClick={() => archiveItem(item.id)}
												disabled={loading || item.isArchived}
											>
												Archive
											</button>
										</div>
									</td>
								</tr>
							))}
							{sortedMenuItems.length === 0 && (
								<tr>
									<td colSpan="6">No menu items yet.</td>
								</tr>
							)}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
};

export default RestaurantMenu;
