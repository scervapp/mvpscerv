import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/DataExplorer.css";

const stringifyDoc = (doc) => JSON.stringify(doc || {}, null, 2);

const DataExplorer = () => {
	const [collectionPath, setCollectionPath] = useState("restaurants");
	const [documentPath, setDocumentPath] = useState("");
	const [confirmPath, setConfirmPath] = useState("");
	const [reason, setReason] = useState("");
	const [jsonText, setJsonText] = useState("{}");
	const [merge, setMerge] = useState(true);
	const [docs, setDocs] = useState([]);
	const [selectedDoc, setSelectedDoc] = useState(null);
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const setBusy = () => {
		setLoading(true);
		setMessage("");
		setError("");
	};

	const loadCollection = async () => {
		setBusy();
		try {
			const getCollection = httpsCallable(
				functions,
				"getScervFirestoreCollection",
			);
			const response = await getCollection({ collectionPath, pageSize: 50 });
			setDocs(response.data?.docs || []);
			setMessage(`Loaded ${response.data?.docs?.length || 0} docs.`);
		} catch (err) {
			console.error("Failed to load collection:", err);
			setError(err.message || "Failed to load collection.");
		} finally {
			setLoading(false);
		}
	};

	const loadDocument = async (path = documentPath) => {
		if (!path) return;
		setBusy();
		try {
			const getDocument = httpsCallable(functions, "getScervFirestoreDocument");
			const response = await getDocument({ documentPath: path });
			const doc = response.data?.doc || null;
			setDocumentPath(path);
			setSelectedDoc(doc);
			setJsonText(stringifyDoc(doc || {}));
			setMessage(response.data?.exists ? "Document loaded." : "Document not found.");
		} catch (err) {
			console.error("Failed to load document:", err);
			setError(err.message || "Failed to load document.");
		} finally {
			setLoading(false);
		}
	};

	const saveDocument = async () => {
		setBusy();
		try {
			const payload = JSON.parse(jsonText);
			const setDocument = httpsCallable(functions, "setScervFirestoreDocument");
			await setDocument({ documentPath, payload, merge, reason });
			setMessage("Document saved.");
			await loadDocument(documentPath);
		} catch (err) {
			console.error("Failed to save document:", err);
			setError(err.message || "Failed to save document.");
			setLoading(false);
		}
	};

	const deleteDocument = async () => {
		if (!window.confirm(`Delete ${documentPath}? This cannot be undone.`)) return;
		setBusy();
		try {
			const deleteDoc = httpsCallable(functions, "deleteScervFirestoreDocument");
			await deleteDoc({ documentPath, confirmPath, reason });
			setSelectedDoc(null);
			setJsonText("{}");
			setMessage("Document deleted.");
		} catch (err) {
			console.error("Failed to delete document:", err);
			setError(err.message || "Failed to delete document.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="data-explorer-container">
			<div className="data-explorer-header">
				<h1>Firestore Data Explorer</h1>
				<p>
					Godmode emergency access for support fixes, audits, and production
					data inspection.
				</p>
			</div>

			{message && <p className="data-message">{message}</p>}
			{error && <p className="data-error">{error}</p>}

			<div className="data-explorer-grid">
				<section className="data-panel">
					<h2>Collection Browser</h2>
					<label>
						Collection path
						<input
							value={collectionPath}
							onChange={(event) => setCollectionPath(event.target.value)}
							placeholder="restaurants"
						/>
					</label>
					<button type="button" onClick={loadCollection} disabled={loading}>
						Load collection
					</button>
					<div className="data-doc-list">
						{docs.map((doc) => {
							const fullPath = `${collectionPath.replace(/^\/+|\/+$/g, "")}/${doc.id}`;
							return (
								<button
									key={doc.id}
									type="button"
									onClick={() => loadDocument(fullPath)}
								>
									<strong>{doc.id}</strong>
									<span>
										{doc.restaurantName ||
											doc.email ||
											doc.title ||
											doc.name ||
											doc.status ||
											"document"}
									</span>
								</button>
							);
						})}
						{docs.length === 0 && <p>No docs loaded.</p>}
					</div>
				</section>

				<section className="data-panel editor">
					<h2>Document Editor</h2>
					<label>
						Document path
						<input
							value={documentPath}
							onChange={(event) => setDocumentPath(event.target.value)}
							placeholder="restaurants/restaurantId"
						/>
					</label>
					<div className="data-actions">
						<button
							type="button"
							onClick={() => loadDocument(documentPath)}
							disabled={loading || !documentPath}
						>
							Load document
						</button>
						<label className="merge-toggle">
							<input
								type="checkbox"
								checked={merge}
								onChange={(event) => setMerge(event.target.checked)}
							/>
							Merge save
						</label>
					</div>
					{selectedDoc && (
						<p className="data-doc-meta">
							Loaded `{selectedDoc.id}`. Edit the JSON below, add a reason, then
							save.
						</p>
					)}
					<textarea
						className="json-editor"
						value={jsonText}
						onChange={(event) => setJsonText(event.target.value)}
						spellCheck="false"
					/>
					<label>
						Reason
						<input
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Customer support correction, onboarding fix, etc."
						/>
					</label>
					<div className="data-actions">
						<button
							type="button"
							onClick={saveDocument}
							disabled={loading || !documentPath || !reason}
						>
							Save document
						</button>
						<input
							value={confirmPath}
							onChange={(event) => setConfirmPath(event.target.value)}
							placeholder="Exact path to delete"
						/>
						<button
							type="button"
							className="danger"
							onClick={deleteDocument}
							disabled={
								loading || !documentPath || confirmPath !== documentPath || !reason
							}
						>
							Delete
						</button>
					</div>
				</section>
			</div>
		</div>
	);
};

export default DataExplorer;
