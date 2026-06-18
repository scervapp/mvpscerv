import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/NewsletterSubscribers.css";

const STATUS_OPTIONS = [
	"all",
	"subscribed",
	"paused",
	"unsubscribed",
	"bounced",
	"spam",
];

const AUDIENCE_LABELS = {
	restaurant_operator: "Restaurant operator",
	dining_guest: "Dining guest",
	both: "Both",
};

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "--";
	return date.toLocaleString();
};

const NewsletterSubscribers = () => {
	const [subscribers, setSubscribers] = useState([]);
	const [statusFilter, setStatusFilter] = useState("subscribed");
	const [loading, setLoading] = useState(false);
	const [savingId, setSavingId] = useState("");
	const [error, setError] = useState("");
	const [drafts, setDrafts] = useState({});

	const loadSubscribers = async (status = statusFilter) => {
		setLoading(true);
		setError("");
		try {
			const listSubscribers = httpsCallable(
				functions,
				"listScervNewsletterSubscribers",
			);
			const response = await listSubscribers({ status });
			const nextSubscribers = response.data?.subscribers || [];
			setSubscribers(nextSubscribers);
			setDrafts(
				nextSubscribers.reduce((acc, subscriber) => {
					acc[subscriber.id] = {
						status: subscriber.status || "subscribed",
						notes: subscriber.notes || "",
					};
					return acc;
				}, {}),
			);
		} catch (err) {
			console.error("Error loading newsletter subscribers:", err);
			setError("Failed to load newsletter subscribers.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadSubscribers(statusFilter);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [statusFilter]);

	const updateDraft = (subscriberId, key, value) => {
		setDrafts((current) => ({
			...current,
			[subscriberId]: {
				...(current[subscriberId] || {}),
				[key]: value,
			},
		}));
	};

	const saveSubscriber = async (subscriberId) => {
		setSavingId(subscriberId);
		setError("");
		try {
			const updateSubscriber = httpsCallable(
				functions,
				"updateScervNewsletterSubscriber",
			);
			const draft = drafts[subscriberId] || {};
			const response = await updateSubscriber({
				subscriberId,
				status: draft.status || "subscribed",
				notes: draft.notes || "",
			});
			const updatedSubscriber = response.data?.subscriber;
			if (updatedSubscriber) {
				setSubscribers((current) =>
					current.map((subscriber) =>
						subscriber.id === subscriberId ? updatedSubscriber : subscriber,
					),
				);
			}
		} catch (err) {
			console.error("Error updating newsletter subscriber:", err);
			setError("Failed to update newsletter subscriber.");
		} finally {
			setSavingId("");
		}
	};

	return (
		<div className="newsletter-subscribers-container">
			<section className="newsletter-subscribers-header">
				<div>
					<h1>Newsletter Subscribers</h1>
					<p>
						People who joined from Scerv resources and website content. Use this
						list to manage status before broader newsletter sends.
					</p>
				</div>
				<button
					type="button"
					onClick={() => loadSubscribers()}
					disabled={loading}
				>
					{loading ? "Refreshing..." : "Refresh"}
				</button>
			</section>

			<div className="newsletter-subscribers-filters">
				<label htmlFor="subscriberStatusFilter">Status</label>
				<select
					id="subscriberStatusFilter"
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

			{error && <p className="newsletter-subscribers-error">{error}</p>}
			{loading && (
				<p className="newsletter-subscribers-empty">
					Loading newsletter subscribers...
				</p>
			)}
			{!loading && subscribers.length === 0 && (
				<p className="newsletter-subscribers-empty">
					No newsletter subscribers found.
				</p>
			)}

			<div className="newsletter-subscribers-grid">
				{subscribers.map((subscriber) => {
					const draft = drafts[subscriber.id] || {};
					return (
						<article className="newsletter-subscriber-card" key={subscriber.id}>
							<div className="newsletter-subscriber-card-header">
								<div>
									<h2>{subscriber.email || "Unknown email"}</h2>
									<p>
										{AUDIENCE_LABELS[subscriber.audience] ||
											subscriber.audience ||
											"Unknown audience"}
									</p>
								</div>
								<span
									className={`newsletter-subscriber-status ${
										subscriber.status || "subscribed"
									}`}
								>
									{subscriber.status || "subscribed"}
								</span>
							</div>

							<dl className="newsletter-subscriber-details">
								<div>
									<dt>Source</dt>
									<dd>{subscriber.source || "--"}</dd>
								</div>
								<div>
									<dt>Page</dt>
									<dd>{subscriber.pagePath || "--"}</dd>
								</div>
								<div>
									<dt>Last signup</dt>
									<dd>{formatDate(subscriber.lastSignupAt)}</dd>
								</div>
								<div>
									<dt>Signup count</dt>
									<dd>{subscriber.signupCount || 1}</dd>
								</div>
								<div>
									<dt>Welcome email</dt>
									<dd>
										{subscriber.welcomeEmailSent
											? "Sent"
											: subscriber.emailError || "Not sent"}
									</dd>
								</div>
								<div>
									<dt>Admin alert</dt>
									<dd>{subscriber.adminNotificationEmailSent ? "Sent" : "No"}</dd>
								</div>
							</dl>

							<div className="newsletter-subscriber-controls">
								<label>
									Status
									<select
										value={draft.status || subscriber.status || "subscribed"}
										onChange={(event) =>
											updateDraft(subscriber.id, "status", event.target.value)
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
											updateDraft(subscriber.id, "notes", event.target.value)
										}
										rows={3}
										placeholder="Internal newsletter notes..."
									/>
								</label>
								<button
									type="button"
									onClick={() => saveSubscriber(subscriber.id)}
									disabled={savingId === subscriber.id}
								>
									{savingId === subscriber.id ? "Saving..." : "Save Subscriber"}
								</button>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
};

export default NewsletterSubscribers;
