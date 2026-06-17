import React, { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../config/firebase";
import { normalizeAdminRole } from "../utils/adminRoles";
import "./styles/AdminUsers.css";

const emptyForm = {
	email: "",
	displayName: "",
	password: "",
	role: "admin",
};

const AdminUsers = () => {
	const [adminUsers, setAdminUsers] = useState([]);
	const [form, setForm] = useState(emptyForm);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	const loadAdminUsers = useCallback(async () => {
		setLoading(true);
		setError("");

		try {
			const listUsers = httpsCallable(functions, "listScervAdminUsers");
			const response = await listUsers({});
			setAdminUsers(response.data?.users || []);
		} catch (loadError) {
			console.error("Error loading Scerv admin users:", loadError);
			setError("Unable to load admin users.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadAdminUsers();
	}, [loadAdminUsers]);

	const updateFormField = (field, value) => {
		setForm((currentForm) => ({ ...currentForm, [field]: value }));
	};

	const handleCreateAdmin = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");

		try {
			const createAdminUser = httpsCallable(functions, "createScervAdminUser");
			await createAdminUser(form);
			await auth.currentUser?.getIdToken(true);
			setForm(emptyForm);
			setMessage("Admin user saved. Share the temporary password privately.");
			await loadAdminUsers();
		} catch (createError) {
			console.error("Error creating admin user:", createError);
			setError(createError.message || "Unable to create admin user.");
		} finally {
			setSaving(false);
		}
	};

	const handleRoleChange = async (user, role) => {
		setError("");
		setMessage("");

		try {
			const updateRole = httpsCallable(functions, "updateScervAdminUserRole");
			await updateRole({ uid: user.uid, role });
			setMessage(`Updated ${user.email} to ${role}.`);
			await loadAdminUsers();
		} catch (roleError) {
			console.error("Error updating admin role:", roleError);
			setError(roleError.message || "Unable to update admin role.");
		}
	};

	const handleDisabledChange = async (user, disabled) => {
		setError("");
		setMessage("");

		try {
			const setDisabled = httpsCallable(functions, "setScervAdminUserDisabled");
			await setDisabled({ uid: user.uid, disabled });
			setMessage(`${user.email} ${disabled ? "disabled" : "enabled"}.`);
			await loadAdminUsers();
		} catch (disabledError) {
			console.error("Error updating admin disabled state:", disabledError);
			setError(disabledError.message || "Unable to update admin access.");
		}
	};

	return (
		<div className="admin-users-container">
			<section className="admin-users-header">
				<div>
					<h1>Admin Users</h1>
					<p>
						Manage Scerv portal access. Godmode users can create admins,
						change roles, and disable portal accounts.
					</p>
				</div>
			</section>

			{error && <p className="admin-users-error">{error}</p>}
			{message && <p className="admin-users-message">{message}</p>}

			<section className="admin-users-panel">
				<h2>Create or Restore Admin</h2>
				<form className="admin-users-form" onSubmit={handleCreateAdmin}>
					<label>
						Email
						<input
							type="email"
							value={form.email}
							onChange={(event) => updateFormField("email", event.target.value)}
							required
						/>
					</label>
					<label>
						Name
						<input
							type="text"
							value={form.displayName}
							onChange={(event) =>
								updateFormField("displayName", event.target.value)
							}
							placeholder="Optional"
						/>
					</label>
					<label>
						Temporary password
						<input
							type="password"
							minLength={12}
							value={form.password}
							onChange={(event) =>
								updateFormField("password", event.target.value)
							}
							required
						/>
					</label>
					<label>
						Role
						<select
							value={form.role}
							onChange={(event) => updateFormField("role", event.target.value)}
						>
							<option value="admin">Admin</option>
							<option value="godmode">Godmode</option>
						</select>
					</label>
					<button type="submit" disabled={saving}>
						{saving ? "Saving..." : "Save Admin"}
					</button>
				</form>
			</section>

			<section className="admin-users-panel">
				<h2>Current Admins</h2>
				{loading ? (
					<p>Loading admin users...</p>
				) : (
					<div className="admin-users-table-wrap">
						<table className="admin-users-table">
							<thead>
								<tr>
									<th>User</th>
									<th>Role</th>
									<th>Status</th>
									<th>Last sign in</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{adminUsers.map((user) => {
									const role = normalizeAdminRole(user.role);
									return (
										<tr key={user.uid}>
											<td>
												<strong>{user.displayName || "Unnamed admin"}</strong>
												<span>{user.email}</span>
											</td>
											<td>
												<select
													value={role || "admin"}
													onChange={(event) =>
														handleRoleChange(user, event.target.value)
													}
												>
													<option value="admin">Admin</option>
													<option value="godmode">Godmode</option>
												</select>
											</td>
											<td>{user.disabled ? "Disabled" : "Active"}</td>
											<td>{user.lastSignInAt || "Never"}</td>
											<td>
												<button
													type="button"
													className={user.disabled ? "enable-button" : "danger-button"}
													onClick={() =>
														handleDisabledChange(user, !user.disabled)
													}
												>
													{user.disabled ? "Enable" : "Disable"}
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						{adminUsers.length === 0 && (
							<p className="admin-users-empty">No admin users found.</p>
						)}
					</div>
				)}
			</section>
		</div>
	);
};

export default AdminUsers;
