import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/Promotions.css";

const emptyPromotion = {
	customerId: "",
	customerEmail: "",
	title: "",
	description: "",
	type: "food_credit",
	amountDollars: "",
	percent: "",
	maxValueDollars: "",
	itemLabel: "",
	restaurantId: "global",
	restaurantName: "",
	fundedBy: "scerv",
	reimbursementPolicy: "reconcile",
	expiresAt: "",
	internalMemo: "",
};

const emptyDefinition = {
	collection: "scervRewardRules",
	title: "",
	label: "",
	description: "",
	rewardLabel: "",
	icon: "sparkles-outline",
	sortOrder: "10",
	metric: "availablePoints",
	operator: "gte",
	value: "100",
	isActive: true,
	isVisible: true,
};

const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getPromotionType = (form) =>
	form.type === "food_credit" ? "discount_amount" : form.type;

const Promotions = () => {
	const [promotionForm, setPromotionForm] = useState(emptyPromotion);
	const [definitionForm, setDefinitionForm] = useState(emptyDefinition);
	const [promotions, setPromotions] = useState([]);
	const [redemptions, setRedemptions] = useState([]);
	const [campaigns, setCampaigns] = useState([]);
	const [filters, setFilters] = useState({
		customerId: "",
		restaurantId: "",
		status: "",
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const loadLedger = async () => {
		setLoading(true);
		setError("");
		try {
			const listLedger = httpsCallable(functions, "listScervPromotionLedger");
			const response = await listLedger({
				pageSize: 150,
				customerId: filters.customerId || null,
				restaurantId: filters.restaurantId || null,
				status: filters.status || null,
			});
			setPromotions(response.data?.promotions || []);
			setRedemptions(response.data?.redemptions || []);
			setCampaigns(response.data?.campaigns || []);
		} catch (err) {
			console.error("Failed to load promotion ledger:", err);
			setError("Failed to load promotion ledger.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadLedger();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const updatePromotion = (field, value) => {
		setPromotionForm((prev) => ({ ...prev, [field]: value }));
	};

	const updateDefinition = (field, value) => {
		setDefinitionForm((prev) => ({ ...prev, [field]: value }));
	};

	const issuePromotion = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const issuePromotionCall = httpsCallable(
				functions,
				"issueScervCustomerPromotion",
			);
			await issuePromotionCall({
				promotion: {
					...promotionForm,
					promotionType: getPromotionType(promotionForm),
					walletValueType:
						promotionForm.type === "food_credit" ? "food_credit" : "promotion",
					isFoodCredit: promotionForm.type === "food_credit",
				},
			});
			setPromotionForm(emptyPromotion);
			setMessage("Promotion issued.");
			await loadLedger();
		} catch (err) {
			console.error("Failed to issue promotion:", err);
			setError(err.message || "Failed to issue promotion.");
		} finally {
			setSaving(false);
		}
	};

	const saveDefinition = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const saveDefinitionCall = httpsCallable(
				functions,
				"saveScervWalletDefinition",
			);
			await saveDefinitionCall({
				collection: definitionForm.collection,
				definition: {
					title: definitionForm.title,
					label: definitionForm.label,
					description: definitionForm.description,
					rewardLabel: definitionForm.rewardLabel,
					icon: definitionForm.icon,
					sortOrder: Number(definitionForm.sortOrder || 0),
					isActive: definitionForm.isActive,
					isVisible: definitionForm.isVisible,
					criteria: {
						metric: definitionForm.metric,
						operator: definitionForm.operator,
						value: Number(definitionForm.value || 0),
					},
				},
			});
			setDefinitionForm(emptyDefinition);
			setMessage("Wallet definition saved.");
			await loadLedger();
		} catch (err) {
			console.error("Failed to save wallet definition:", err);
			setError(err.message || "Failed to save wallet definition.");
		} finally {
			setSaving(false);
		}
	};

	const cancelPromotion = async (promotion) => {
		if (!window.confirm(`Cancel ${promotion.title || promotion.id}?`)) return;
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const cancelPromotionCall = httpsCallable(
				functions,
				"cancelScervCustomerPromotion",
			);
			await cancelPromotionCall({
				customerId: promotion.customerId,
				promotionId: promotion.id,
				reason: "Cancelled from Scerv admin portal",
			});
			setMessage("Promotion cancelled.");
			await loadLedger();
		} catch (err) {
			console.error("Failed to cancel promotion:", err);
			setError(err.message || "Failed to cancel promotion.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="promotions-container">
			<div className="promotions-header">
				<div>
					<h1>Promotions And Food Credits</h1>
					<p>
						Issue customer credits, reconcile redeemed discounts, and publish
						wallet reward rules.
					</p>
				</div>
				<button type="button" onClick={loadLedger} disabled={loading || saving}>
					Refresh
				</button>
			</div>

			{message && <p className="promo-message">{message}</p>}
			{error && <p className="promo-error">{error}</p>}

			<div className="promo-layout">
				<form className="promo-form" onSubmit={issuePromotion}>
					<h2>Issue Credit Or Offer</h2>
					<div className="promo-grid">
						<label>
							Customer ID
							<input
								value={promotionForm.customerId}
								onChange={(event) =>
									updatePromotion("customerId", event.target.value)
								}
							/>
						</label>
						<label>
							Customer email
							<input
								value={promotionForm.customerEmail}
								onChange={(event) =>
									updatePromotion("customerEmail", event.target.value)
								}
							/>
						</label>
						<label className="wide-field">
							Title
							<input
								value={promotionForm.title}
								onChange={(event) => updatePromotion("title", event.target.value)}
							/>
						</label>
						<label className="wide-field">
							Description
							<textarea
								value={promotionForm.description}
								onChange={(event) =>
									updatePromotion("description", event.target.value)
								}
							/>
						</label>
						<label>
							Type
							<select
								value={promotionForm.type}
								onChange={(event) => updatePromotion("type", event.target.value)}
							>
								<option value="food_credit">food credit</option>
								<option value="discount_amount">dollar discount</option>
								<option value="discount_percent">percent discount</option>
								<option value="free_item">free item</option>
								<option value="perk">perk</option>
							</select>
						</label>
						<label>
							Amount dollars
							<input
								type="number"
								step="0.01"
								value={promotionForm.amountDollars}
								onChange={(event) =>
									updatePromotion("amountDollars", event.target.value)
								}
							/>
						</label>
						<label>
							Percent
							<input
								type="number"
								step="0.01"
								value={promotionForm.percent}
								onChange={(event) =>
									updatePromotion("percent", event.target.value)
								}
							/>
						</label>
						<label>
							Max dollars
							<input
								type="number"
								step="0.01"
								value={promotionForm.maxValueDollars}
								onChange={(event) =>
									updatePromotion("maxValueDollars", event.target.value)
								}
							/>
						</label>
						<label>
							Item label
							<input
								value={promotionForm.itemLabel}
								onChange={(event) =>
									updatePromotion("itemLabel", event.target.value)
								}
							/>
						</label>
						<label>
							Restaurant ID
							<input
								value={promotionForm.restaurantId}
								onChange={(event) =>
									updatePromotion("restaurantId", event.target.value)
								}
							/>
						</label>
						<label>
							Restaurant name
							<input
								value={promotionForm.restaurantName}
								onChange={(event) =>
									updatePromotion("restaurantName", event.target.value)
								}
							/>
						</label>
						<label>
							Funded by
							<select
								value={promotionForm.fundedBy}
								onChange={(event) =>
									updatePromotion("fundedBy", event.target.value)
								}
							>
								<option value="scerv">scerv</option>
								<option value="restaurant">restaurant</option>
								<option value="shared">shared</option>
							</select>
						</label>
						<label>
							Reimbursement
							<select
								value={promotionForm.reimbursementPolicy}
								onChange={(event) =>
									updatePromotion("reimbursementPolicy", event.target.value)
								}
							>
								<option value="reconcile">reconcile</option>
								<option value="no_reimbursement">no reimbursement</option>
								<option value="restaurant_funded">restaurant funded</option>
							</select>
						</label>
						<label>
							Expires
							<input
								type="datetime-local"
								value={promotionForm.expiresAt}
								onChange={(event) =>
									updatePromotion("expiresAt", event.target.value)
								}
							/>
						</label>
						<label className="wide-field">
							Internal memo
							<textarea
								value={promotionForm.internalMemo}
								onChange={(event) =>
									updatePromotion("internalMemo", event.target.value)
								}
							/>
						</label>
					</div>
					<button type="submit" disabled={saving}>
						{saving ? "Saving..." : "Issue promotion"}
					</button>
				</form>

				<form className="promo-form compact" onSubmit={saveDefinition}>
					<h2>Wallet Rules</h2>
					<label>
						Collection
						<select
							value={definitionForm.collection}
							onChange={(event) =>
								updateDefinition("collection", event.target.value)
							}
						>
							<option value="scervRewardRules">reward rules</option>
							<option value="scervWalletBadges">wallet badges</option>
						</select>
					</label>
					<label>
						Title
						<input
							value={definitionForm.title}
							onChange={(event) => updateDefinition("title", event.target.value)}
						/>
					</label>
					<label>
						Label
						<input
							value={definitionForm.label}
							onChange={(event) => updateDefinition("label", event.target.value)}
						/>
					</label>
					<label>
						Description
						<textarea
							value={definitionForm.description}
							onChange={(event) =>
								updateDefinition("description", event.target.value)
							}
						/>
					</label>
					<label>
						Reward label
						<input
							value={definitionForm.rewardLabel}
							onChange={(event) =>
								updateDefinition("rewardLabel", event.target.value)
							}
						/>
					</label>
					<div className="promo-grid mini">
						<label>
							Metric
							<input
								value={definitionForm.metric}
								onChange={(event) =>
									updateDefinition("metric", event.target.value)
								}
							/>
						</label>
						<label>
							Operator
							<select
								value={definitionForm.operator}
								onChange={(event) =>
									updateDefinition("operator", event.target.value)
								}
							>
								<option value="gte">gte</option>
								<option value="gt">gt</option>
								<option value="eq">eq</option>
							</select>
						</label>
						<label>
							Value
							<input
								type="number"
								value={definitionForm.value}
								onChange={(event) =>
									updateDefinition("value", event.target.value)
								}
							/>
						</label>
						<label>
							Sort
							<input
								type="number"
								value={definitionForm.sortOrder}
								onChange={(event) =>
									updateDefinition("sortOrder", event.target.value)
								}
							/>
						</label>
					</div>
					<div className="toggle-row">
						<label>
							<input
								type="checkbox"
								checked={definitionForm.isActive}
								onChange={(event) =>
									updateDefinition("isActive", event.target.checked)
								}
							/>
							Active
						</label>
						<label>
							<input
								type="checkbox"
								checked={definitionForm.isVisible}
								onChange={(event) =>
									updateDefinition("isVisible", event.target.checked)
								}
							/>
							Visible
						</label>
					</div>
					<button type="submit" disabled={saving}>
						Save wallet rule
					</button>
				</form>
			</div>

			<section className="promo-panel">
				<div className="promo-panel-header">
					<h2>Ledger</h2>
					<div className="promo-filters">
						<input
							placeholder="Customer ID"
							value={filters.customerId}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									customerId: event.target.value,
								}))
							}
						/>
						<input
							placeholder="Restaurant ID"
							value={filters.restaurantId}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									restaurantId: event.target.value,
								}))
							}
						/>
						<select
							value={filters.status}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, status: event.target.value }))
							}
						>
							<option value="">all statuses</option>
							<option value="available">available</option>
							<option value="redeemed">redeemed</option>
							<option value="cancelled">cancelled</option>
							<option value="expired">expired</option>
						</select>
						<button type="button" onClick={loadLedger}>
							Apply
						</button>
					</div>
				</div>

				{loading ? (
					<p>Loading...</p>
				) : (
					<table className="promo-table">
						<thead>
							<tr>
								<th>Promotion</th>
								<th>Customer</th>
								<th>Restaurant</th>
								<th>Status</th>
								<th>Value</th>
								<th>Expires</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{promotions.map((promotion) => (
								<tr key={`${promotion.customerId}-${promotion.id}`}>
									<td>
										<strong>{promotion.title || promotion.id}</strong>
										<span>{promotion.walletValueType || promotion.promotionType}</span>
									</td>
									<td>
										{promotion.customerId ? (
											<Link to={`/customers/${promotion.customerId}`}>
												{promotion.customerEmail || promotion.customerId}
											</Link>
										) : (
											"--"
										)}
									</td>
									<td>
										{promotion.restaurantId &&
										promotion.restaurantId !== "global" ? (
											<Link to={`/restaurants/${promotion.restaurantId}`}>
												{promotion.restaurantName || promotion.restaurantId}
											</Link>
										) : (
											"global"
										)}
									</td>
									<td>{promotion.status || "available"}</td>
									<td>
										{promotion.promotionType === "discount_percent"
											? `${promotion.promotionValue || 0}% up to ${formatMoney(
													promotion.maxDiscountCents,
												)}`
											: formatMoney(promotion.maxDiscountCents)}
									</td>
									<td>{formatDate(promotion.expiresAt)}</td>
									<td>
										{(promotion.status || "available") === "available" ? (
											<button
												type="button"
												onClick={() => cancelPromotion(promotion)}
												disabled={saving}
											>
												Cancel
											</button>
										) : (
											"--"
										)}
									</td>
								</tr>
							))}
							{promotions.length === 0 && (
								<tr>
									<td colSpan="7">No issued promotions found.</td>
								</tr>
							)}
						</tbody>
					</table>
				)}
			</section>

			<div className="promo-split">
				<section className="promo-panel">
					<h2>Redemptions</h2>
					<table className="promo-table">
						<thead>
							<tr>
								<th>Title</th>
								<th>Restaurant</th>
								<th>Customer</th>
								<th>Applied</th>
								<th>Redeemed</th>
							</tr>
						</thead>
						<tbody>
							{redemptions.map((redemption) => (
								<tr key={redemption.id}>
									<td>{redemption.title || redemption.customerPromotionId}</td>
									<td>
										{redemption.restaurantId ? (
											<Link to={`/restaurants/${redemption.restaurantId}`}>
												{redemption.restaurantId}
											</Link>
										) : (
											"--"
										)}
									</td>
									<td>
										{redemption.customerId ? (
											<Link to={`/customers/${redemption.customerId}`}>
												{redemption.customerId}
											</Link>
										) : (
											"--"
										)}
									</td>
									<td>{formatMoney(redemption.appliedDiscountCents)}</td>
									<td>{formatDate(redemption.redeemedAt)}</td>
								</tr>
							))}
							{redemptions.length === 0 && (
								<tr>
									<td colSpan="5">No redemptions found.</td>
								</tr>
							)}
						</tbody>
					</table>
				</section>

				<section className="promo-panel">
					<h2>Campaigns</h2>
					<div className="campaign-list">
						{campaigns.map((campaign) => (
							<div key={campaign.id}>
								<strong>{campaign.title || campaign.id}</strong>
								<span>
									{campaign.status || "active"} -{" "}
									{formatMoney(campaign.maxDiscountCents)}
								</span>
							</div>
						))}
						{campaigns.length === 0 && <p>No campaign records yet.</p>}
					</div>
				</section>
			</div>
		</div>
	);
};

export default Promotions;
