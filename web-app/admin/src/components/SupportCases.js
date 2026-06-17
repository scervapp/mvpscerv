import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/SupportCases.css";

const emptyCase = {
	title: "",
	description: "",
	status: "open",
	priority: "normal",
	type: "general",
	customerId: "",
	customerEmail: "",
	restaurantId: "",
	restaurantName: "",
	orderId: "",
	reservationId: "",
	assignedTo: "",
};

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const SupportCases = () => {
	const [cases, setCases] = useState([]);
	const [form, setForm] = useState(emptyCase);
	const [editingCaseId, setEditingCaseId] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [relatedId, setRelatedId] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	const loadCases = async () => {
		setLoading(true);
		setError("");
		try {
			const listCases = httpsCallable(functions, "listScervSupportCases");
			const response = await listCases({
				pageSize: 100,
				status: statusFilter || null,
				relatedId: relatedId || null,
			});
			setCases(response.data?.cases || []);
		} catch (err) {
			console.error("Failed to load support cases:", err);
			setError("Failed to load support cases.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadCases();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const updateForm = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const saveCase = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const saveSupportCase = httpsCallable(functions, "saveScervSupportCase");
			await saveSupportCase({
				caseId: editingCaseId || null,
				supportCase: form,
			});
			setForm(emptyCase);
			setEditingCaseId("");
			setMessage("Support case saved.");
			await loadCases();
		} catch (err) {
			console.error("Failed to save support case:", err);
			setError("Failed to save support case.");
		} finally {
			setSaving(false);
		}
	};

	const editCase = (item) => {
		setEditingCaseId(item.id);
		setForm({
			...emptyCase,
			...item,
			description: item.description || "",
		});
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<div className="support-cases-container">
			<div className="support-cases-header">
				<h1>Support Cases</h1>
				<p>Track customer, restaurant, order, reservation, and billing issues.</p>
			</div>

			{message && <p className="support-message">{message}</p>}
			{error && <p className="support-error">{error}</p>}

			<form className="support-case-form" onSubmit={saveCase}>
				<h2>{editingCaseId ? "Update Case" : "Create Case"}</h2>
				<label className="wide-field">
					Title
					<input
						value={form.title}
						onChange={(event) => updateForm("title", event.target.value)}
					/>
				</label>
				<div className="support-grid">
					<label>
						Status
						<select
							value={form.status}
							onChange={(event) => updateForm("status", event.target.value)}
						>
							<option value="open">open</option>
							<option value="waiting">waiting</option>
							<option value="investigating">investigating</option>
							<option value="resolved">resolved</option>
							<option value="closed">closed</option>
						</select>
					</label>
					<label>
						Priority
						<select
							value={form.priority}
							onChange={(event) => updateForm("priority", event.target.value)}
						>
							<option value="low">low</option>
							<option value="normal">normal</option>
							<option value="high">high</option>
							<option value="urgent">urgent</option>
						</select>
					</label>
					<label>
						Type
						<select
							value={form.type}
							onChange={(event) => updateForm("type", event.target.value)}
						>
							<option value="general">general</option>
							<option value="billing">billing</option>
							<option value="refund">refund</option>
							<option value="reservation">reservation</option>
							<option value="restaurant_ops">restaurant ops</option>
							<option value="account">account</option>
						</select>
					</label>
					<label>
						Assigned to
						<input
							value={form.assignedTo}
							onChange={(event) => updateForm("assignedTo", event.target.value)}
						/>
					</label>
				</div>
				<label className="wide-field">
					Description
					<textarea
						value={form.description}
						onChange={(event) => updateForm("description", event.target.value)}
					/>
				</label>
				<div className="support-grid">
					<label>
						Customer ID
						<input
							value={form.customerId}
							onChange={(event) => updateForm("customerId", event.target.value)}
						/>
					</label>
					<label>
						Customer email
						<input
							value={form.customerEmail}
							onChange={(event) => updateForm("customerEmail", event.target.value)}
						/>
					</label>
					<label>
						Restaurant ID
						<input
							value={form.restaurantId}
							onChange={(event) => updateForm("restaurantId", event.target.value)}
						/>
					</label>
					<label>
						Restaurant name
						<input
							value={form.restaurantName}
							onChange={(event) =>
								updateForm("restaurantName", event.target.value)
							}
						/>
					</label>
					<label>
						Order ID
						<input
							value={form.orderId}
							onChange={(event) => updateForm("orderId", event.target.value)}
						/>
					</label>
					<label>
						Reservation ID
						<input
							value={form.reservationId}
							onChange={(event) =>
								updateForm("reservationId", event.target.value)
							}
						/>
					</label>
				</div>
				<div className="support-actions">
					<button type="submit" disabled={saving}>
						{saving ? "Saving..." : "Save Case"}
					</button>
					{editingCaseId && (
						<button
							type="button"
							onClick={() => {
								setEditingCaseId("");
								setForm(emptyCase);
							}}
						>
							Cancel Edit
						</button>
					)}
				</div>
			</form>

			<form
				className="support-filters"
				onSubmit={(event) => {
					event.preventDefault();
					loadCases();
				}}
			>
				<select
					value={statusFilter}
					onChange={(event) => setStatusFilter(event.target.value)}
				>
					<option value="">All statuses</option>
					<option value="open">open</option>
					<option value="waiting">waiting</option>
					<option value="investigating">investigating</option>
					<option value="resolved">resolved</option>
					<option value="closed">closed</option>
				</select>
				<input
					value={relatedId}
					onChange={(event) => setRelatedId(event.target.value)}
					placeholder="Customer, restaurant, order, reservation ID"
				/>
				<button type="submit" disabled={loading}>
					{loading ? "Loading..." : "Filter"}
				</button>
			</form>

			<table className="support-table">
				<thead>
					<tr>
						<th>Case</th>
						<th>Status</th>
						<th>Priority</th>
						<th>Links</th>
						<th>Updated</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{cases.map((item) => (
						<tr key={item.id}>
							<td>
								<strong>{item.title}</strong>
								<span>{item.type}</span>
							</td>
							<td>{item.status}</td>
							<td>{item.priority}</td>
							<td>
								{item.customerId && <Link to={`/customers/${item.customerId}`}>Customer</Link>}
								{item.restaurantId && <Link to={`/restaurants/${item.restaurantId}`}>Restaurant</Link>}
								{item.orderId && <Link to={`/orders/${item.orderId}`}>Order</Link>}
							</td>
							<td>{formatDate(item.updatedAt || item.createdAt)}</td>
							<td>
								<button type="button" onClick={() => editCase(item)}>
									Edit
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{!loading && cases.length === 0 && <p>No support cases found.</p>}
		</div>
	);
};

export default SupportCases;
