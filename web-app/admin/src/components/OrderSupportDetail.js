import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import "./styles/OrderSupportDetail.css";

const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const formatDate = (value) => {
	if (!value) return "--";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const OrderSupportDetail = () => {
	const { id } = useParams();
	const [detail, setDetail] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [note, setNote] = useState("");
	const [noteStatus, setNoteStatus] = useState("needs_review");
	const [refundAmount, setRefundAmount] = useState("");
	const [refundReason, setRefundReason] = useState("");

	const loadDetail = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const getDetail = httpsCallable(functions, "getScervOrderSupportDetail");
			const response = await getDetail({ orderId: id });
			setDetail(response.data);
		} catch (err) {
			console.error("Failed to load order support detail:", err);
			setError("Failed to load order detail.");
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		loadDetail();
	}, [loadDetail]);

	const order = useMemo(() => detail?.order || {}, [detail]);
	const refundSummary = useMemo(
		() => order.refundSummary || {},
		[order],
	);
	const refundableCents = Number(refundSummary.refundableCents || 0);
	const paymentIntentId = order.paymentIntentId || "";
	const isStripeOrder = order.paymentProcessor === "stripe" && paymentIntentId;

	const paymentRows = useMemo(
		() => [
			["Subtotal", order.subtotal],
			["Discounts", order.discountTotal],
			["Tax", order.taxAmount],
			["Gratuity", order.gratuityAmount],
			["Platform fee", order.platformFee],
			["Processor fee", order.processorFee],
			["Restaurant transfer", order.restaurantTransferAmount],
			["Total paid", order.totalPrice],
			["Refunded", refundSummary.totalRefundedCents],
			["Pending refunds", refundSummary.pendingRefundCents],
			["Refundable", refundableCents],
		],
		[order, refundSummary, refundableCents],
	);

	const addNote = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");
		if (!note.trim()) {
			setError("Enter a support note.");
			return;
		}

		setSaving(true);
		try {
			const addSupportNote = httpsCallable(functions, "addScervOrderSupportNote");
			await addSupportNote({ orderId: id, note, status: noteStatus });
			setNote("");
			setMessage("Support note saved.");
			await loadDetail();
		} catch (err) {
			console.error("Failed to add support note:", err);
			setError("Failed to save support note.");
		} finally {
			setSaving(false);
		}
	};

	const submitRefund = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");

		const amountCents = Math.round(Number(refundAmount || 0) * 100);
		if (amountCents <= 0 || amountCents > refundableCents) {
			setError("Enter a valid refund amount within the refundable balance.");
			return;
		}
		if (!refundReason.trim()) {
			setError("Enter a refund reason.");
			return;
		}
		if (
			!window.confirm(
				`Refund ${formatMoney(amountCents)} for order ${
					order.readableOrderId || id
				}?`,
			)
		) {
			return;
		}

		setSaving(true);
		try {
			const refundOrder = httpsCallable(functions, "refundScervStripeOrder");
			await refundOrder({
				orderId: id,
				amountCents,
				reason: refundReason,
				refundType: amountCents === refundableCents ? "full" : "partial",
			});
			setRefundAmount("");
			setRefundReason("");
			setMessage("Refund submitted to Stripe.");
			await loadDetail();
		} catch (err) {
			console.error("Refund failed:", err);
			setError(err.message || "Refund failed.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <div className="order-support-container">Loading...</div>;
	}

	if (error && !detail) {
		return <div className="order-support-container error">{error}</div>;
	}

	return (
		<div className="order-support-container">
			<div className="order-support-header">
				<div>
					<Link to="/command-center">Back to Command Center</Link>
					<h1>Order {order.readableOrderId || order.id || id}</h1>
					<p>
						{order.restaurantName || "Unknown restaurant"} ·{" "}
						{order.paymentStatus || "unknown"} ·{" "}
						{formatDate(order.fulfilledAt || order.openedAt)}
					</p>
				</div>
				<div className="order-support-total">
					<span>Total paid</span>
					<strong>{formatMoney(order.totalPrice)}</strong>
				</div>
			</div>

			{message && <p className="order-support-message">{message}</p>}
			{error && <p className="order-support-error">{error}</p>}

			<div className="order-support-grid">
				<section className="order-support-panel">
					<h2>Customer</h2>
					<p>
						<strong>{order.customerName || "Scerv Guest"}</strong>
					</p>
					<p>{order.customerEmail || "--"}</p>
					{order.customerId && (
						<Link to={`/customers/${order.customerId}`}>Open Customer 360</Link>
					)}
				</section>

				<section className="order-support-panel">
					<h2>Restaurant</h2>
					<p>
						<strong>{order.restaurantName || "--"}</strong>
					</p>
					<p>{detail?.restaurant?.city || "--"}, {detail?.restaurant?.state || "--"}</p>
					{order.restaurantId && (
						<Link to={`/restaurants/${order.restaurantId}`}>
							Open Restaurant 360
						</Link>
					)}
				</section>

				<section className="order-support-panel">
					<h2>Payment Trace</h2>
					<dl>
						<dt>Processor</dt>
						<dd>{order.paymentProcessor || "--"}</dd>
						<dt>Payment intent</dt>
						<dd>{paymentIntentId || "--"}</dd>
						<dt>Connect type</dt>
						<dd>{order.stripeConnectChargeType || "--"}</dd>
						<dt>Transfer</dt>
						<dd>{order.stripeDestinationTransferId || "--"}</dd>
					</dl>
				</section>

				<section className="order-support-panel">
					<h2>Support Status</h2>
					<dl>
						<dt>Support status</dt>
						<dd>{order.raw?.supportStatus || "--"}</dd>
						<dt>Order status</dt>
						<dd>{order.orderStatus || "--"}</dd>
						<dt>Mode</dt>
						<dd>{order.orderMode || order.fulfillmentType || "--"}</dd>
						<dt>Table</dt>
						<dd>{order.table?.name || order.table?.tableNumber || "--"}</dd>
					</dl>
				</section>
			</div>

			<section className="order-support-panel">
				<h2>Payment Breakdown</h2>
				<div className="order-money-grid">
					{paymentRows.map(([label, value]) => (
						<div key={label}>
							<span>{label}</span>
							<strong>{formatMoney(value)}</strong>
						</div>
					))}
				</div>
			</section>

			<section className="order-support-panel">
				<h2>Items</h2>
				{order.items?.length ? (
					<table className="order-support-table">
						<thead>
							<tr>
								<th>Item</th>
								<th>Category</th>
								<th>Qty</th>
								<th>Price</th>
							</tr>
						</thead>
						<tbody>
							{order.items.map((item, index) => (
								<tr key={`${item.id || item.name}-${index}`}>
									<td>{item.name || item.dishName || "Item"}</td>
									<td>{item.category || "--"}</td>
									<td>{item.quantity || 1}</td>
									<td>{formatMoney(Math.round(Number(item.price || 0) * 100))}</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p>No item details found.</p>
				)}
			</section>

			<div className="order-support-grid">
				<section className="order-support-panel">
					<h2>Support Notes</h2>
					<form className="order-support-form" onSubmit={addNote}>
						<select
							value={noteStatus}
							onChange={(event) => setNoteStatus(event.target.value)}
						>
							<option value="needs_review">Needs review</option>
							<option value="customer_contacted">Customer contacted</option>
							<option value="restaurant_contacted">Restaurant contacted</option>
							<option value="resolved">Resolved</option>
						</select>
						<textarea
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Internal support note"
						/>
						<button type="submit" disabled={saving}>
							Save Note
						</button>
					</form>
					<div className="order-support-list">
						{detail?.notes?.map((row) => (
							<div key={row.id}>
								<strong>{row.status || "note"}</strong>
								<span>{formatDate(row.createdAt)}</span>
								<p>{row.note}</p>
							</div>
						))}
						{!detail?.notes?.length && <p>No support notes yet.</p>}
					</div>
				</section>

				<section className="order-support-panel">
					<h2>Refunds</h2>
					<form className="order-support-form" onSubmit={submitRefund}>
						<input
							type="number"
							step="0.01"
							min="0"
							max={(refundableCents / 100).toFixed(2)}
							value={refundAmount}
							onChange={(event) => setRefundAmount(event.target.value)}
							placeholder={`Max ${(refundableCents / 100).toFixed(2)}`}
							disabled={!isStripeOrder || refundableCents <= 0}
						/>
						<textarea
							value={refundReason}
							onChange={(event) => setRefundReason(event.target.value)}
							placeholder="Refund reason"
							disabled={!isStripeOrder || refundableCents <= 0}
						/>
						<button
							type="submit"
							disabled={saving || !isStripeOrder || refundableCents <= 0}
						>
							Submit Refund
						</button>
					</form>
					{!isStripeOrder && <p>Only Stripe orders can be refunded here.</p>}
					<div className="order-support-list">
						{detail?.refunds?.map((row) => (
							<div key={row.id}>
								<strong>
									{formatMoney(row.amountCents)} · {row.status}
								</strong>
								<span>{row.stripeRefundId || row.id}</span>
								<p>{row.reason}</p>
							</div>
						))}
						{!detail?.refunds?.length && <p>No refunds recorded.</p>}
					</div>
				</section>
			</div>
		</div>
	);
};

export default OrderSupportDetail;
