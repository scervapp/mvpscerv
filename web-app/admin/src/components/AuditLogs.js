import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/AuditLogs.css";

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const AuditLogs = () => {
	const [logs, setLogs] = useState([]);
	const [filters, setFilters] = useState({
		restaurantId: "",
		actorUid: "",
		action: "",
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const loadLogs = async (nextFilters = filters) => {
		setLoading(true);
		setError("");
		try {
			const listLogs = httpsCallable(functions, "listScervAdminAuditLogs");
			const response = await listLogs({
				pageSize: 100,
				restaurantId: nextFilters.restaurantId || null,
				actorUid: nextFilters.actorUid || null,
				action: nextFilters.action || null,
			});
			setLogs(response.data?.logs || []);
		} catch (err) {
			console.error("Failed to load audit logs:", err);
			setError("Failed to load audit logs.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadLogs();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const updateFilter = (field, value) => {
		setFilters((prev) => ({ ...prev, [field]: value }));
	};

	const applyFilters = (event) => {
		event.preventDefault();
		loadLogs(filters);
	};

	return (
		<div className="audit-log-container">
			<div className="audit-log-header">
				<h1>Admin Audit Logs</h1>
				<p>Review Scerv-side changes across support, billing, refunds, and onboarding.</p>
			</div>

			<form className="audit-log-filters" onSubmit={applyFilters}>
				<input
					value={filters.restaurantId}
					onChange={(event) => updateFilter("restaurantId", event.target.value)}
					placeholder="Restaurant ID"
				/>
				<input
					value={filters.actorUid}
					onChange={(event) => updateFilter("actorUid", event.target.value)}
					placeholder="Actor UID"
				/>
				<input
					value={filters.action}
					onChange={(event) => updateFilter("action", event.target.value)}
					placeholder="Action"
				/>
				<button type="submit" disabled={loading}>
					{loading ? "Loading..." : "Apply"}
				</button>
			</form>

			{error && <p className="audit-log-error">{error}</p>}

			<table className="audit-log-table">
				<thead>
					<tr>
						<th>When</th>
						<th>Action</th>
						<th>Actor</th>
						<th>Payload</th>
					</tr>
				</thead>
				<tbody>
					{logs.map((log) => (
						<tr key={log.id}>
							<td>{formatDate(log.createdAt)}</td>
							<td>{log.action}</td>
							<td className="audit-mono">{log.actorUid}</td>
							<td>
								<pre>{JSON.stringify(log.payload || {}, null, 2)}</pre>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{!loading && logs.length === 0 && <p>No audit logs found.</p>}
		</div>
	);
};

export default AuditLogs;
