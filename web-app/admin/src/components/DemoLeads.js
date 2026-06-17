import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/DemoLeads.css";

const STATUS_OPTIONS = ["all", "new", "contacted", "scheduled", "closed", "spam"];

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "--";
	return date.toLocaleString();
};

const DemoLeads = () => {
	const [leads, setLeads] = useState([]);
	const [statusFilter, setStatusFilter] = useState("new");
	const [loading, setLoading] = useState(false);
	const [savingId, setSavingId] = useState("");
	const [error, setError] = useState("");
	const [drafts, setDrafts] = useState({});

	const loadLeads = async (status = statusFilter) => {
		setLoading(true);
		setError("");
		try {
			const listLeads = httpsCallable(functions, "listScervDemoLeads");
			const response = await listLeads({ status });
			const nextLeads = response.data?.leads || [];
			setLeads(nextLeads);
			setDrafts(
				nextLeads.reduce((acc, lead) => {
					acc[lead.id] = {
						status: lead.status || "new",
						notes: lead.notes || "",
					};
					return acc;
				}, {}),
			);
		} catch (err) {
			console.error("Error loading demo leads:", err);
			setError("Failed to load demo leads.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadLeads(statusFilter);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [statusFilter]);

	const updateDraft = (leadId, key, value) => {
		setDrafts((current) => ({
			...current,
			[leadId]: {
				...(current[leadId] || {}),
				[key]: value,
			},
		}));
	};

	const saveLead = async (leadId) => {
		setSavingId(leadId);
		setError("");
		try {
			const updateLead = httpsCallable(functions, "updateScervDemoLead");
			const draft = drafts[leadId] || {};
			const response = await updateLead({
				leadId,
				status: draft.status || "new",
				notes: draft.notes || "",
			});
			const updatedLead = response.data?.lead;
			if (updatedLead) {
				setLeads((current) =>
					current.map((lead) => (lead.id === leadId ? updatedLead : lead)),
				);
			}
		} catch (err) {
			console.error("Error updating demo lead:", err);
			setError("Failed to update demo lead.");
		} finally {
			setSavingId("");
		}
	};

	return (
		<div className="demo-leads-container">
			<section className="demo-leads-header">
				<div>
					<h1>Demo Leads</h1>
					<p>
						Website demo requests from restaurant operators. New requests are
						also emailed to admin@scerv.com.
					</p>
				</div>
				<button type="button" onClick={() => loadLeads()} disabled={loading}>
					{loading ? "Refreshing..." : "Refresh"}
				</button>
			</section>

			<div className="demo-leads-filters">
				<label htmlFor="statusFilter">Status</label>
				<select
					id="statusFilter"
					value={statusFilter}
					onChange={(event) => setStatusFilter(event.target.value)}
				>
					{STATUS_OPTIONS.map((status) => (
						<option value={status} key={status}>
							{status === "all" ? "All" : status}
						</option>
					))}
				</select>
			</div>

			{error && <p className="demo-leads-error">{error}</p>}
			{loading && <p className="demo-leads-empty">Loading demo leads...</p>}
			{!loading && leads.length === 0 && (
				<p className="demo-leads-empty">No demo leads found.</p>
			)}

			<div className="demo-leads-grid">
				{leads.map((lead) => {
					const draft = drafts[lead.id] || {};
					return (
						<article className="demo-lead-card" key={lead.id}>
							<div className="demo-lead-card-header">
								<div>
									<h2>{lead.restaurantName || "Unnamed restaurant"}</h2>
									<p>{lead.name || "Unknown contact"}</p>
								</div>
								<span className={`demo-lead-status ${lead.status || "new"}`}>
									{lead.status || "new"}
								</span>
							</div>

							<dl className="demo-lead-details">
								<div>
									<dt>Email</dt>
									<dd>
										<a href={`mailto:${lead.email}`}>{lead.email || "--"}</a>
									</dd>
								</div>
								<div>
									<dt>Phone</dt>
									<dd>
										<a href={`tel:${lead.phone}`}>{lead.phone || "--"}</a>
									</dd>
								</div>
								<div>
									<dt>Submitted</dt>
									<dd>{formatDate(lead.createdAt)}</dd>
								</div>
								<div>
									<dt>Email alert</dt>
									<dd>
										{lead.notificationEmailSent
											? "Sent"
											: lead.notificationEmailError || "Not sent"}
									</dd>
								</div>
							</dl>

							{lead.message && (
								<div className="demo-lead-message">
									<strong>Message</strong>
									<p>{lead.message}</p>
								</div>
							)}

							<div className="demo-lead-controls">
								<label>
									Status
									<select
										value={draft.status || lead.status || "new"}
										onChange={(event) =>
											updateDraft(lead.id, "status", event.target.value)
										}
									>
										{STATUS_OPTIONS.filter((status) => status !== "all").map(
											(status) => (
												<option value={status} key={status}>
													{status}
												</option>
											),
										)}
									</select>
								</label>
								<label>
									Notes
									<textarea
										value={draft.notes || ""}
										onChange={(event) =>
											updateDraft(lead.id, "notes", event.target.value)
										}
										rows={3}
										placeholder="Internal follow-up notes..."
									/>
								</label>
								<button
									type="button"
									onClick={() => saveLead(lead.id)}
									disabled={savingId === lead.id}
								>
									{savingId === lead.id ? "Saving..." : "Save Lead"}
								</button>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
};

export default DemoLeads;
