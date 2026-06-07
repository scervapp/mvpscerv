const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const bcrypt = require("bcrypt");
const { Translate } = require("@google-cloud/translate").v2;
const { assertRestaurantPermission } = require("./restaurantAccess");
const { generateOrderId } = require("./orderFunctions");

const translate = new Translate();

const generateTableId = (name) => {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "_") // Replace spaces with underscores
		.replace(/[^a-z0-9_]/g, ""); // Remove special characters
};

const getRestaurantSeatIdForItem = (item = {}) => {
	if (item.seatId) return String(item.seatId);
	if (item.orderedForSeatId) return String(item.orderedForSeatId);
	if (item.orderedByUserId) return `guest_${item.orderedByUserId}`;
	return "table_share";
};

const getRestaurantSeatNameForItem = (item = {}) => {
	return (
		item.seatName ||
		item.orderedForSeatName ||
		item.orderedForName ||
		item.orderedByPipName ||
		item.customerName ||
		"Table"
	);
};

const calculateRestaurantCloseoutTotals = (items, restaurantTaxRate) => {
	let subtotalCents = 0;
	let originalSubtotalCents = 0;
	let taxAmountCents = 0;

	(items || []).forEach((item) => {
		const activePrice =
			item.discountedPrice !== undefined && item.discountedPrice !== null
				? item.discountedPrice
				: item.price || 0;

		const itemPrice = parseFloat(activePrice || 0);
		const originalPrice = parseFloat(item.price || 0);
		const quantity = parseInt(item.quantity || 1, 10);

		const itemPriceCents = Math.round(itemPrice * 100);
		const originalPriceCents = Math.round(originalPrice * 100);

		subtotalCents += itemPriceCents * quantity;
		originalSubtotalCents += originalPriceCents * quantity;

		if (!isNaN(restaurantTaxRate) && restaurantTaxRate > 0) {
			taxAmountCents += Math.round(
				itemPriceCents * quantity * restaurantTaxRate,
			);
		}
	});

	return {
		subtotalCents,
		originalSubtotalCents,
		taxAmountCents,
		discountTotalCents: Math.max(0, originalSubtotalCents - subtotalCents),
	};
};

/**
 * Helper function to process Firestore operations in chunks of 500
 * (Enterprise standard to prevent batch limit crashes)
 */
const commitBatches = async (operations) => {
	const CHUNK_SIZE = 500;
	for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
		const chunk = operations.slice(i, i + CHUNK_SIZE);
		const batch = db.batch();
		chunk.forEach((op) => batch[op.type](op.ref, op.data));
		await batch.commit();
	}
};

function formatPanamaPhone(phone) {
	if (!phone) return "";
	// Strip away everything except raw numbers
	const digits = String(phone).replace(/\D/g, "");

	// Format as mobile (XXXX-XXXX)
	if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;

	// Format as landline (XXX-XXXX)
	if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

	// Fallback just in case
	return String(phone);
}

// ============================================================================
// 1. HELPER FUNCTIONS (Internal, No Exports)
// ============================================================================

function toIsoDate(dateLike) {
	if (!dateLike) return new Date().toISOString();

	if (typeof dateLike.toDate === "function") {
		const d = dateLike.toDate();
		if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
			throw new RangeError(
				`Invalid Firestore Timestamp passed to toIsoDate: ${JSON.stringify(dateLike)}`,
			);
		}
		return d.toISOString();
	}

	if (dateLike instanceof Date) {
		if (Number.isNaN(dateLike.getTime()))
			throw new RangeError("Invalid JS Date passed to toIsoDate");
		return dateLike.toISOString();
	}

	if (
		typeof dateLike === "object" &&
		dateLike !== null &&
		typeof dateLike._seconds === "number"
	) {
		const d = new Date(dateLike._seconds * 1000);
		if (Number.isNaN(d.getTime()))
			throw new RangeError(`Invalid serialized timestamp passed to toIsoDate`);
		return d.toISOString();
	}

	const d = new Date(dateLike);
	if (Number.isNaN(d.getTime())) {
		throw new RangeError(
			`Invalid time value passed to toIsoDate: ${JSON.stringify(dateLike)}`,
		);
	}
	return d.toISOString();
}

async function getRestaurantDgiConfig(restaurantId) {
	const snap = await admin
		.firestore()
		.collection("restaurants")
		.doc(restaurantId)
		.collection("private_config")
		.doc("dgi")
		.get();

	if (!snap.exists) {
		throw new Error(`DGI config not found for restaurant ${restaurantId}.`);
	}
	return snap.data();
}

function validateDgiConfig(dgiConfig) {
	const missing = [];
	if (!dgiConfig.isEnabled) missing.push("isEnabled");
	if (!dgiConfig.credentials || !dgiConfig.credentials.apiKey)
		missing.push("credentials.apiKey");

	const emisor = dgiConfig.emisor || {};
	if (!emisor.ruc) missing.push("emisor.ruc");
	if (!emisor.dv) missing.push("emisor.dv");

	return { ok: missing.length === 0, missing };
}
function buildCustomerReceiver(customer, order) {
	const fullName =
		(customer && customer.dlocalName) ||
		(customer && customer.fullName) ||
		(order && order.customerName) ||
		"Consumidor Final";

	const receiverEmail =
		customer && customer.email && String(customer.email).trim()
			? String(customer.email).trim().toLowerCase()
			: order && order.customerEmail && String(order.customerEmail).trim()
				? String(order.customerEmail).trim().toLowerCase()
				: "";

	return {
		tipoReceptorFe: "02",
		nombreRazonReceptor: fullName,
		direccionReceptor: (customer && customer.address) || "Panamá",
		telefonoContactoReceptor:
			formatPanamaPhone(customer && customer.phone) || "6666-6666",
		correoElectronicoRecepctor: receiverEmail,
		paisReceptor: "PA",
	};
}

// Only attach the Location block if we actually have a location code

// ============================================================================
// 2. THE PAYLOAD BUILDER (The Brains)
// ============================================================================

function buildEfacturaPayload({ order, customer, dgiConfig }) {
	const emisor = dgiConfig.emisor || {};
	const cfg = dgiConfig.config || {};
	const items = Array.isArray(order.items) ? order.items : [];

	// --- 1. CLAMP THE INVOICE NUMBER ---
	let numDocumento = "1";
	if (order.readableOrderId && typeof order.readableOrderId === "string") {
		numDocumento = order.readableOrderId.replace(/\D/g, "");
		if (!numDocumento) numDocumento = "1";
	}
	const safeNumDocumento = String(numDocumento).slice(-10).padStart(10, "0");

	// --- 2. BUILD AND FILTER ITEMS ---
	let listaItems = items
		.map((item, index) => {
			const qty = Number(item.quantity || 1);

			let rawPrice = item.price;
			if (rawPrice === undefined || rawPrice === null)
				rawPrice = item.unitPrice;
			if (rawPrice === undefined || rawPrice === null)
				rawPrice = item.discountedPrice;

			const precioUnitario = Number(Number(rawPrice || 0).toFixed(2));
			const precioItem = Number((precioUnitario * qty).toFixed(2));
			const descuento = Number(Number(item.discountAmount || 0).toFixed(2));
			const precioAcarreo = 0;

			const rawRate =
				item.itbmsRate !== undefined && item.itbmsRate !== null
					? Number(item.itbmsRate)
					: 0;

			let dgiTaxCode = "00";
			if (rawRate === 7) dgiTaxCode = "01";
			if (rawRate === 10) dgiTaxCode = "02";
			if (rawRate === 15) dgiTaxCode = "03";

			const taxableBase = Number(
				(precioItem - descuento + precioAcarreo).toFixed(2),
			);
			const lineTax = Number((taxableBase * (rawRate / 100)).toFixed(2));
			const sumaPrecioItem = Number((taxableBase + lineTax).toFixed(2));

			const itemDescription = String(
				item.dishName || item.name || item.title || `Item ${index + 1}`,
			).trim();

			console.log("[DGI ITEM TAX DEBUG]", {
				name: itemDescription,
				qty,
				precioUnitario,
				precioItem,
				rawRate,
				dgiTaxCode,
				taxableBase,
				lineTax,
				sumaPrecioItem,
			});

			return {
				numeroSecuenciaItem: index + 1,
				descripcionProductoServicio: itemDescription,
				codigoInternoItem: String(item.menuItemId || item.id || index + 1),
				cantidadProductoServicio: qty,
				codigoItemCodificacionPanamenaAbreviada: 81,
				grupoPrecios: {
					precioUnitarioTransferencia: precioUnitario,
					precioItem: precioItem,
					precioAcarreo: precioAcarreo,
					descuento: descuento,
					sumaPrecioItem: sumaPrecioItem,
				},
				grupoITBMS: {
					tasaITBMSAplicable: dgiTaxCode,
					montoITBMS: lineTax,
				},
			};
		})
		.filter((item) => item.grupoPrecios.precioUnitarioTransferencia > 0);

	// --- 3. CALCULATE STRICT GLOBAL TOTALS ---
	let totalNeto = 0;
	let totalITBMS = 0;
	let totalGravado = 0;
	let valorTotalFactura = 0;

	listaItems.forEach((item) => {
		totalNeto += Number(item.grupoPrecios.precioItem || 0);
		totalITBMS += Number(item.grupoITBMS.montoITBMS || 0);
		valorTotalFactura += Number(item.grupoPrecios.sumaPrecioItem || 0);

		if (item.grupoITBMS.tasaITBMSAplicable !== "00") {
			totalGravado += Number(item.grupoITBMS.montoITBMS || 0);
		}
	});

	totalNeto = Number(totalNeto.toFixed(2));
	totalITBMS = Number(totalITBMS.toFixed(2));
	totalGravado = Number(totalGravado.toFixed(2));
	valorTotalFactura = Number(valorTotalFactura.toFixed(2));

	console.log("[DGI MATH DEBUG] GLOBAL TOTALS:", {
		totalNeto,
		totalITBMS,
		valorTotalFactura,
	});

	return {
		datosGenerales: {
			tipoEmision: "01",
			tipoDocumento: String(cfg.tipoDocumento || "01").padStart(2, "0"),
			numeroDocumento: safeNumDocumento,
			puntoFacturacion: String(cfg.puntoFacturacion || 1).padStart(3, "0"),
			fechaEmision: toIsoDate(
				order.fulfilledAt || order.openedAt || order.createdAt || new Date(),
			),
			naturalezaOperacion: "01",
			tipoOperacion: 1,
			destinoOperacion: 1,
			formatoGeneracionCafe: 1,
			maneraEntregaCafe: 1,
			envioContenedorReceptor: 1,
			procesoGeneracionFe: 1,
			tipoTransaccionVenta: 1,
			tipoSucursal: 1,
			informacionEmisor: {
				datosRucEmisor: {
					tipoContribuyente: 1,
					ruc: emisor.ruc,
					digitoVerificador: emisor.dv,
				},
				nombreORazonSocial: emisor.razonSocial,
				codigoSucursal: String(emisor.codigoSucursal || "0").padStart(4, "0"),
				direccionSucursal: emisor.direccion || "",
				ubicacionEmisor: {
					codigoUbicacion: emisor.codigoUbicacion || "",
					corregimiento: emisor.corregimiento || "",
					distrito: String(emisor.distrito || "Panama")
						.replace(/Distrito de /i, "")
						.replace(/á/g, "a")
						.replace(/Á/g, "A")
						.trim(),
					provincia: String(emisor.provincia || "Panama")
						.replace(/Provincia de /i, "")
						.replace(/á/g, "a")
						.replace(/Á/g, "A")
						.trim(),
				},
				telefonoSucursal: formatPanamaPhone(emisor.telefono),
				direccionCorreoElectronico: emisor.correo || "",
			},
			informacionReceptor: buildCustomerReceiver(customer, order),
		},
		listaItems,
		totales: {
			totalNeto: totalNeto,
			totalITBMS: totalITBMS,
			totalGravado: totalGravado,
			valorTotalFactura: valorTotalFactura,
			sumaValoresRecibidos: valorTotalFactura,
			tiempoPago: 1,
			numeroTotalItems: listaItems.length,
			totalTodosItems: valorTotalFactura,
			grupoFormasPago: [
				{
					formaPago: "04",
					valorCuotaPagada: valorTotalFactura,
				},
			],
		},
		ambiente: cfg.ambiente === "production" ? 1 : 2,
		secuencia: Number(order.dgiSequence || 1),
		versionFormulario: cfg.versionFormulario || "1.0",
	};
}

// ============================================================================
// 3. THE INTERNAL ORCHESTRATOR
// ============================================================================

async function emitDgiInvoiceInternal(orderId) {
	try {
		console.log(`[DGI] Starting invoice for order: ${orderId}`);
		const db = admin.firestore();

		const orderRef = db.collection("orders").doc(orderId);
		const orderSnap = await orderRef.get();

		if (!orderSnap.exists) throw new Error("Order not found");
		const order = orderSnap.data();

		if (order.paymentStatus !== "paid") throw new Error("Order is not paid");
		if (order.dgiInvoiceStatus === "issued") {
			console.log("[DGI] Already issued, skipping.");
			return { success: true, cufe: order.dgiCufe };
		}

		const restaurantSnap = await db
			.collection("restaurants")
			.doc(order.restaurantId)
			.get();
		const restaurantData = restaurantSnap.exists ? restaurantSnap.data() : {};

		const dgiConfig = await getRestaurantDgiConfig(order.restaurantId);
		const validation = validateDgiConfig(dgiConfig);
		if (!validation.ok)
			throw new Error(
				`DGI config incomplete: ${validation.missing.join(", ")}`,
			);

		let customer = {};
		if (order.customerId) {
			const customerSnap = await db
				.collection("customers")
				.doc(order.customerId)
				.get();
			if (customerSnap.exists) customer = customerSnap.data();
		}

		const payload = buildEfacturaPayload({ order, customer, dgiConfig });

		payload.listaItems.forEach((item, i) => {
			if (
				!item.descripcionProductoServicio ||
				!String(item.descripcionProductoServicio).trim()
			) {
				throw new Error(
					`DGI payload invalid: missing descripcionProductoServicio for item ${i + 1}`,
				);
			}
		});

		console.log("[DGI DEBUG] FINAL PAYLOAD:", JSON.stringify(payload, null, 2));

		await orderRef.set(
			{
				dgiInvoiceStatus: "processing",
				dgiLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);
		console.log("[DGI FINAL EMAIL DEBUG]", {
			emisorEmail:
				payload &&
				payload.datosGenerales &&
				payload.datosGenerales.informacionEmisor &&
				payload.datosGenerales.informacionEmisor.direccionCorreoElectronico
					? payload.datosGenerales.informacionEmisor.direccionCorreoElectronico
					: null,
			receptorEmail:
				payload &&
				payload.datosGenerales &&
				payload.datosGenerales.informacionReceptor &&
				payload.datosGenerales.informacionReceptor.correoElectronicoRecepctor
					? payload.datosGenerales.informacionReceptor
							.correoElectronicoRecepctor
					: null,
		});

		const response = await fetch(
			"https://api.efacturapty.com/api/v1/Invoices",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${dgiConfig.credentials.apiKey}`,
				},
				body: JSON.stringify(payload),
			},
		);

		const result = await response.json();

		if (!response.ok || result.autorizada === false) {
			throw new Error(`Raw API Response: ${JSON.stringify(result)}`);
		}

		console.log("[DGI] Success! CUFE Generated.");

		let cufe = result.cufe || null;
		let qrLink = result.qrContent || null;

		if (
			!cufe &&
			result.rRetEnviFe &&
			result.rRetEnviFe.xProtFe &&
			result.rRetEnviFe.xProtFe.rProtFe &&
			result.rRetEnviFe.xProtFe.rProtFe.gInfProt &&
			result.rRetEnviFe.xProtFe.rProtFe.gInfProt.dCUFE
		) {
			cufe = result.rRetEnviFe.xProtFe.rProtFe.gInfProt.dCUFE;
		}

		await orderRef.set(
			{
				dgiInvoiceStatus: "issued",
				dgiIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
				dgiCufe: cufe,
				dgiQrLink: qrLink,
				dgiResponse: result,
			},
			{ merge: true },
		);

		await db
			.collection("restaurants")
			.doc(order.restaurantId)
			.collection("private_config")
			.doc("dgi")
			.set(
				{
					status: {
						lastInvoiceAt: admin.firestore.FieldValue.serverTimestamp(),
						lastInvoiceStatus: "issued",
						lastError: null,
					},
				},
				{ merge: true },
			);

		// --- EMAIL THE CUSTOMER ---
		const receiptEmail =
			customer && customer.email && String(customer.email).trim()
				? String(customer.email).trim().toLowerCase()
				: order && order.customerEmail && String(order.customerEmail).trim()
					? String(order.customerEmail).trim().toLowerCase()
					: "";

		const restaurantDisplayName =
			restaurantData && (restaurantData.restaurantName || restaurantData.name)
				? restaurantData.restaurantName || restaurantData.name
				: dgiConfig && dgiConfig.emisor && dgiConfig.emisor.razonSocial
					? dgiConfig.emisor.razonSocial
					: "Our Restaurant";

		const restaurantLegalName =
			dgiConfig && dgiConfig.emisor && dgiConfig.emisor.razonSocial
				? dgiConfig.emisor.razonSocial
				: restaurantDisplayName;

		const displayItems = (Array.isArray(order.items) ? order.items : []).map(
			(item, index) => {
				const qty = Number(item.quantity || 1);

				const unitPrice =
					item.price !== undefined && item.price !== null
						? Number(item.price)
						: item.unitPrice !== undefined && item.unitPrice !== null
							? Number(item.unitPrice)
							: item.discountedPrice !== undefined &&
								  item.discountedPrice !== null
								? Number(item.discountedPrice)
								: 0;

				const lineTotal = Number((qty * unitPrice).toFixed(2));

				return {
					name:
						item.dishName || item.name || item.title || "Item " + (index + 1),
					qty: qty,
					unitPrice: unitPrice,
					lineTotal: lineTotal,
				};
			},
		);

		const centsToDollars = (value) => {
			const num = Number(value || 0);
			if (isNaN(num)) return 0;
			return Number((num / 100).toFixed(2));
		};

		const subtotal =
			order.subtotal !== undefined && order.subtotal !== null
				? centsToDollars(order.subtotal)
				: Number(
						displayItems
							.reduce((sum, item) => sum + item.lineTotal, 0)
							.toFixed(2),
					);

		const tax =
			order.taxAmount !== undefined && order.taxAmount !== null
				? centsToDollars(order.taxAmount)
				: order.tax !== undefined && order.tax !== null
					? centsToDollars(order.tax)
					: order.itbmsTotal !== undefined && order.itbmsTotal !== null
						? Number(order.itbmsTotal)
						: order.taxTotal !== undefined && order.taxTotal !== null
							? Number(order.taxTotal)
							: 0;

		const gratuity =
			order.gratuityAmount !== undefined && order.gratuityAmount !== null
				? centsToDollars(order.gratuityAmount)
				: order.gratuity !== undefined && order.gratuity !== null
					? centsToDollars(order.gratuity)
					: 0;

		const serviceFee =
			order.platformFee !== undefined && order.platformFee !== null
				? centsToDollars(order.platformFee)
				: 0;

		const total =
			order.totalPrice !== undefined && order.totalPrice !== null
				? centsToDollars(order.totalPrice)
				: Number((subtotal + tax + gratuity + serviceFee).toFixed(2));

		console.log("[EMAIL NORMALIZED TOTALS]", {
			subtotal,
			tax,
			gratuity,
			serviceFee,
			total,
			rawSubtotal: order.subtotal || null,
			rawTaxAmount:
				order.taxAmount ||
				order.tax ||
				order.itbmsTotal ||
				order.taxTotal ||
				null,
			rawGratuity: order.gratuityAmount || order.gratuity || null,
			rawPlatformFee: order.platformFee || null,
			rawTotalPrice: order.totalPrice || null,
		});

		const itemsHtml = displayItems.length
			? displayItems
					.map(
						(item) => `
<tr>
  <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
    <div style="font-weight: 600; color: #111;">${item.name}</div>
    <div style="font-size: 12px; color: #666;">Qty: ${item.qty}</div>
  </td>
  <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; color: #111;">
    $${item.lineTotal.toFixed(2)}
  </td>
</tr>
`,
					)
					.join("")
			: `<tr>
<td colspan="2" style="padding: 10px 0; color: #666;">
Your receipt is attached and available through the official DGI link below.
</td>
</tr>`;

		if (receiptEmail) {
			console.log("[DGI EMAIL DEBUG]", {
				receiptEmail: receiptEmail,
				hasCufe: !!cufe,
				hasQrLink: !!qrLink,
			});

			console.log("[SCERV EMAIL DEBUG]", {
				receiptEmail: receiptEmail || null,
				customerEmail: customer && customer.email ? customer.email : null,
				orderCustomerEmail:
					order && order.customerEmail ? order.customerEmail : null,
			});

			await db.collection("mail").add({
				to: receiptEmail,
				message: {
					subject: "Your receipt from " + restaurantDisplayName,
					html: `
<div style="font-family: Arial, sans-serif; background: #f6f7f9; padding: 24px;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e8eaed;">
    
    <div style="background: #111; color: #fff; padding: 24px 28px;">
      <h1 style="margin: 0; font-size: 22px;">${restaurantDisplayName}</h1>
      <p style="margin: 8px 0 0; color: #d1d5db; font-size: 14px;">
        Your electronic receipt is ready
      </p>
    </div>

    <div style="padding: 28px;">
      <p style="margin: 0 0 18px; font-size: 15px; color: #333;">
        Thanks for your order. Your payment was successful and your official electronic invoice has been generated.
      </p>

      <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 22px;">
        <div style="margin-bottom: 8px; font-size: 14px; color: #444;">
          <strong>Order:</strong> ${order.readableOrderId || orderId}
        </div>
        <div style="margin-bottom: 8px; font-size: 14px; color: #444;">
          <strong>CUFE:</strong> ${cufe || "Pending"}
        </div>
        <div style="font-size: 14px; color: #444;">
          <strong>Email:</strong> ${receiptEmail}
        </div>
      </div>

      <h2 style="font-size: 16px; margin: 0 0 12px; color: #111;">
        Order summary
      </h2>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        ${itemsHtml}
      </table>

     <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 14px;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #444; font-size: 14px;">
    <span>Subtotal</span>
    <span>$${subtotal.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #444; font-size: 14px;">
    <span>Tax</span>
    <span>$${tax.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #444; font-size: 14px;">
    <span>Gratuity</span>
    <span>$${gratuity.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #444; font-size: 14px;">
    <span>Service Fee</span>
    <span>$${serviceFee.toFixed(2)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 16px; color: #111;">
    <span>Total</span>
    <span>$${total.toFixed(2)}</span>
  </div>
</div>

      ${
				qrLink
					? `<div style="margin-top: 24px;">
              <a href="${qrLink}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
                View official DGI receipt
              </a>
            </div>`
					: ""
			}

      <p style="margin-top: 28px; font-size: 12px; color: #777;">
        Powered by Scerv
      </p>
    </div>
  </div>
</div>
`,
				},
			});

			console.log("[DGI] Email queued for " + receiptEmail);
		}
		return { success: true, cufe };
	} catch (error) {
		console.error("[DGI] FAILED:", error.message);
		try {
			await admin.firestore().collection("orders").doc(orderId).set(
				{
					dgiInvoiceStatus: "failed",
					dgiInvoiceError: error.message,
					dgiLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		} catch (e) {
			console.error("[DGI] Failed to write error state to DB:", e);
		}
		throw error;
	}
}

// ============================================================================
// 4. THE PUBLIC CLOUD FUNCTION (The Trigger)
// ============================================================================

exports.emitDgiInvoice = functions
	.runWith({ timeoutSeconds: 120 })
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authenticated.",
			);
		}

		const { orderId } = data || {};
		if (!orderId || typeof orderId !== "string") {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"orderId is required.",
			);
		}

		try {
			return await emitDgiInvoiceInternal(orderId);
		} catch (error) {
			throw new functions.https.HttpsError(
				"internal",
				error.message || "Could not emit DGI invoice.",
			);
		}
	});

// If you need to trigger this directly from another backend function (like confirmDlocalPayment),
// you can export the internal function as well:
exports.emitDgiInvoiceInternal = emitDgiInvoiceInternal;

/**
 * Starts a new work day for a restaurant.
 */
exports.startWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}

	const { restaurantId } = data;
	if (!restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID is required.",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const workDaysRef = restaurantRef.collection("work_days");

	try {
		// 1. Prevent overlapping work days
		const openDaysSnapshot = await workDaysRef
			.where("status", "==", "OPEN")
			.limit(1)
			.get();
		if (!openDaysSnapshot.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"A work day is already open.",
			);
		}

		console.log(
			`[Enterprise] Starting Day for ${restaurantId}. Running fallback cleanup...`,
		);
		const batchOperations = [];

		// 2. Failsafe: Reset lingering tables (if the app crashed the night before)
		const tablesSnapshot = await restaurantRef
			.collection("tables")
			.where("status", "!=", "available")
			.get();
		tablesSnapshot.docs.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					status: "available",
					currentCheckInId: null,
					currentCustomerId: null,
					seatedAt: null,
				},
			});
		});

		// 3. Failsafe: Archive stale kitchen orders
		const activeOrdersSnapshot = await db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.get();

		activeOrdersSnapshot.docs.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					overallStatus: "archived_stale",
					archivedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
			});
		});

		// Execute cleanup safely
		if (batchOperations.length > 0) await commitBatches(batchOperations);

		// 4. Create New Work Day
		const newWorkDayRef = workDaysRef.doc();
		const startBatch = db.batch();

		startBatch.set(newWorkDayRef, {
			status: "OPEN",
			startTime: admin.firestore.FieldValue.serverTimestamp(),
			endTime: null,
			managerWhoOpened: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
		});

		// 5. Update main restaurant doc with the current work day ID
		startBatch.update(restaurantRef, {
			isOpen: true,
			currentWorkDayId: newWorkDayRef.id,
		});

		await startBatch.commit();

		return { success: true, workDayId: newWorkDayRef.id };
	} catch (error) {
		console.error(`Start Day Error (${restaurantId}):`, error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not start day.",
		);
	}
});

/**
 * Ends the current open work day for a restaurant.
 */
exports.endWorkDay = functions.https.onCall(async (data, context) => {
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}

	const { restaurantId, workDayId } = data;
	if (!restaurantId || !workDayId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant and Work Day IDs are required.",
		);
	}

	const restaurantRef = db.collection("restaurants").doc(restaurantId);
	const workDayRef = restaurantRef.collection("work_days").doc(workDayId);

	try {
		// 1. Strict Enterprise Validation: No tables can be occupied
		const unresolvedTables = await restaurantRef
			.collection("tables")
			.where("status", "!=", "available")
			.limit(1)
			.get();
		if (!unresolvedTables.empty) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot close the day. All tables must be settled and cleared first.",
			);
		}

		const workDayDoc = await workDayRef.get();
		if (!workDayDoc.exists || workDayDoc.data().status !== "OPEN") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Work day is not open.",
			);
		}

		// 2. Fetch active kitchen orders to ARCHIVE (Never delete)
		const activeKitchenOrders = await db
			.collection("kitchen_orders")
			.where("restaurantId", "==", restaurantId)
			.where("overallStatus", "==", "active")
			.get();

		const batchOperations = [];

		activeKitchenOrders.forEach((doc) => {
			batchOperations.push({
				type: "update",
				ref: doc.ref,
				data: {
					overallStatus: "archived_eod",
					archivedAt: admin.firestore.FieldValue.serverTimestamp(),
					closedByWorkDay: workDayId,
				},
			});
		});

		// Execute archiving safely
		if (batchOperations.length > 0) await commitBatches(batchOperations);

		// 3. Finalize the Work Day
		const endBatch = db.batch();

		endBatch.update(workDayRef, {
			status: "CLOSED",
			endTime: admin.firestore.FieldValue.serverTimestamp(),
			managerWhoClosed: {
				uid: context.auth.uid,
				name: context.auth.token.name || "Manager",
			},
		});

		// 4. Wipe the active workday pointer on the restaurant
		endBatch.update(restaurantRef, {
			isOpen: false,
			currentWorkDayId: null,
		});

		await endBatch.commit();

		return { success: true, ordersArchived: activeKitchenOrders.size };
	} catch (error) {
		console.error(`End Day Error (${workDayId}):`, error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not end day.",
		);
	}
});

/**
 * A scheduled function that runs every day at 5:00 AM Eastern Time.
 * It finds any work days that were left open for more than 18 hours
 * and automatically closes them to prevent data contamination.
 */
exports.autoCloseStaleWorkDays = functions.pubsub
	.schedule("every day 05:00")
	.timeZone("America/New_York")
	.onRun(async (context) => {
		console.log("Running scheduled job: autoCloseStaleWorkDays...");

		const now = new Date();
		const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000);
		const staleTimestamp = admin.firestore.Timestamp.fromDate(eighteenHoursAgo);

		// Find all work_days subcollections that have a stale, open day
		const staleDaysQuery = db
			.collectionGroup("work_days")
			.where("status", "==", "OPEN")
			.where("startTime", "<=", staleTimestamp);

		const staleDaysSnapshot = await staleDaysQuery.get();

		if (staleDaysSnapshot.empty) {
			console.log("No stale work days found. Job finished.");
			return null;
		}

		console.log(`Found ${staleDaysSnapshot.size} stale work days to close.`);
		const batch = db.batch();

		staleDaysSnapshot.forEach((doc) => {
			console.log(`Closing stale work day: ${doc.id} at path: ${doc.ref.path}`);
			// Update the work_day status to 'CLOSED_AUTO'
			batch.update(doc.ref, {
				status: "CLOSED_AUTO",
				endTime: admin.firestore.FieldValue.serverTimestamp(),
				notes:
					"Automatically closed by system due to being open for over 18 hours.",
			});

			// Also update the parent restaurant's `isOpen` flag to false
			const restaurantRef = doc.ref.parent.parent; // Navigates up to the restaurant doc
			if (restaurantRef) {
				batch.update(restaurantRef, { isOpen: false });
			}
		});

		await batch.commit();
		console.log("Successfully closed all found stale work days.");
		return null;
	});

exports.addTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId, name, capacity } = data;
	if (!restaurantId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table name, and capacity are required.",
		);
	}

	try {
		// Generate the custom ID using the helper function
		const customTableId = generateTableId(name);

		const newTableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(customTableId); // Use the predictable ID

		// Check if a table with this exact formatted name already exists
		const tableDoc = await newTableRef.get();
		if (tableDoc.exists) {
			throw new functions.https.HttpsError(
				"already-exists",
				`A table named '${name}' (ID: ${customTableId}) already exists.`,
			);
		}

		await newTableRef.set({
			id: customTableId,
			name: name, // Keep the pretty "Table 1" for the UI display
			capacity: Number(capacity),
			status: "available",
			restaurantId: restaurantId,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		return { success: true, tableId: customTableId };
	} catch (error) {
		console.error("Error adding table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not add new table.",
			error.message,
		);
	}
});

/**
 * Updates an existing table's name and/or capacity.
 * If the name changes, it moves the document to a new formatted ID.
 */
exports.updateTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId, tableId, name, capacity } = data;
	if (!restaurantId || !tableId || !name || !capacity) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, table ID, name, and capacity are required.",
		);
	}

	try {
		const tablesCollection = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables");

		const oldTableRef = tablesCollection.doc(tableId);

		// Generate the new ID based on the updated name
		const newTableId = generateTableId(name);

		// If the generated ID is the exact same, just update the capacity normally
		if (tableId === newTableId) {
			await oldTableRef.update({
				name: name,
				capacity: Number(capacity),
			});
			return { success: true, tableId: tableId };
		}

		// If the ID changed (they renamed the table), we have to migrate the document
		return await db.runTransaction(async (transaction) => {
			const oldTableDoc = await transaction.get(oldTableRef);
			if (!oldTableDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Original table not found.",
				);
			}

			const newTableRef = tablesCollection.doc(newTableId);
			const newTableDoc = await transaction.get(newTableRef);

			if (newTableDoc.exists) {
				throw new functions.https.HttpsError(
					"already-exists",
					`A table named '${name}' already exists.`,
				);
			}

			// Create the new document
			transaction.set(newTableRef, {
				...oldTableDoc.data(), // Copy all old data
				id: newTableId, // Update the ID
				name: name, // Update the Name
				capacity: Number(capacity), // Update the capacity
			});

			// Delete the old document
			transaction.delete(oldTableRef);

			return { success: true, tableId: newTableId };
		});
	} catch (error) {
		console.error("Error updating table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not update table.",
			error.message,
		);
	}
});

/**
 * Deletes a table. Fails if the table is currently occupied.
 */
exports.deleteTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const { restaurantId, tableId } = data;
	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID and Table ID are required.",
		);
	}

	try {
		const tableRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("tables")
			.doc(tableId);
		const tableDoc = await tableRef.get();

		if (!tableDoc.exists) {
			return { success: true, message: "Table already deleted." };
		}
		if (tableDoc.data().status === "OCCUPIED") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot delete a table that is currently occupied.",
			);
		}

		await tableRef.delete();
		return { success: true };
	} catch (error) {
		console.error("Error deleting table:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not delete table.",
			error.message,
		);
	}
});

/**
 * Applies a discount to a specific item within a shared_basket or individual basket.
 * It records the discount amount, reason, and the manager who applied it.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.partyId - The ID of the party (if it's a party order).
 * @param {string} data.checkInId - The ID of the check-in (for individual orders).
 * @param {string} data.itemId - The unique ID of the basket item instance to discount.
 * @param {number} data.discountAmount - The amount to discount, in dollars (e.g., 5.50 for $5.50).
 * @param {string} data.reason - The reason for the discount.
 * @param {object} context - The Firebase Functions context object.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.discountOrderItem = functions.https.onCall(async (data, context) => {
	// Authentication & Authorization (TODO: Add role check for manager/supervisor)
	// Authentication & Authorization (TODO: Add role check for manager/supervisor)
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be authorized.",
		);
	}
	const manager = {
		uid: context.auth.uid,
		name: context.auth.token.name || "Manager",
	};

	const { partyId, checkInId, itemId, discountAmount, reason, staffId } = data;

	if (!itemId || typeof discountAmount !== "number" || !reason) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Item ID, discount amount, and reason are required.",
		);
	}
	if (!partyId && !checkInId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Either a partyId or checkInId is required.",
		);
	}

	const isPartyOrder = !!partyId;

	try {
		if (isPartyOrder) {
			const partySnap = await db.collection("parties").doc(partyId).get();
			if (!partySnap.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}
			const partyData = partySnap.data() || {};
			await assertRestaurantPermission({
				db,
				context,
				restaurantId: partyData.restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				action: "discount order items",
			});

			// --- HANDLE PARTY ORDER ---
			const docRef = db.collection("shared_baskets").doc(partyId);
			await db.runTransaction(async (transaction) => {
				const docSnap = await transaction.get(docRef);
				if (!docSnap.exists)
					throw new functions.https.HttpsError(
						"not-found",
						"Party basket not found.",
					);

				const data = docSnap.data();
				let items = data.items || [];
				let itemUpdated = false;

				const updatedItems = items.map((item) => {
					if (item.id === itemId) {
						itemUpdated = true;
						const originalPrice = parseFloat(item.price || 0);
						const finalDiscount = Math.min(originalPrice, discountAmount);
						const discountedPrice = originalPrice - finalDiscount;
						return {
							...item,
							discount: finalDiscount,
							discountedPrice,
							discountReason: reason,
							discountedBy: manager,
						};
					}
					return item;
				});

				if (!itemUpdated)
					throw new functions.https.HttpsError(
						"not-found",
						"The specific item to discount was not found in the party order.",
					);

				transaction.update(docRef, { items: updatedItems });
			});
		} else {
			let restaurantId = null;
			if (checkInId) {
				const checkInSnap = await db.collection("checkIns").doc(checkInId).get();
				if (checkInSnap.exists) {
					restaurantId = (checkInSnap.data() || {}).restaurantId || null;
				}
			}

			// --- HANDLE INDIVIDUAL ORDER ---
			// For an individual order, the 'itemId' is the document ID in the 'baskets' collection.
			const docRef = db.collection("baskets").doc(itemId);
			const docSnap = await docRef.get();

			if (!docSnap.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"The specific item to discount was not found.",
				);
			}

			const item = docSnap.data();
			restaurantId = restaurantId || item.restaurantId || null;
			await assertRestaurantPermission({
				db,
				context,
				restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				action: "discount order items",
			});

			const originalPrice = parseFloat(item.dish.price || 0);
			const finalDiscount = Math.min(originalPrice, discountAmount);
			const discountedPrice = originalPrice - finalDiscount;

			await docRef.update({
				discount: finalDiscount,
				discountedPrice: discountedPrice,
				discountReason: reason,
				discountedBy: manager,
			});
		}

		console.log(`Successfully applied discount to item ${itemId}.`);
		return { success: true };
	} catch (error) {
		console.error("Error applying discount:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not apply discount.",
			error.message,
		);
	}
});

/**
 * Sets or updates an employee's POS PIN.
 * It takes a plain-text PIN, hashes it, and saves the hash to the employee's document.
 *
 * @param {object} data
 * @param {string} data.targetUserId The UID of the manager/employee to set the PIN for.
 * @param {string} data.pin The 4 to 6-digit PIN as a string.
 */
exports.setManagerPin = functions.https.onCall(async (data, context) => {
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const { restaurantId, employeeId, pin, staffId } = data;
	const pinValue = String(pin || "").trim();
	if (!restaurantId || !employeeId || !/^\d{4,6}$/.test(pinValue)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A restaurant ID, target employee ID, and a 4-6 digit PIN are required.",
		);
	}

	try {
		const requester = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "reset POS PINs",
		});

		// --- THIS IS THE FIX ---
		// Directly reference the employee document by its ID instead of querying.
		const employeeDocRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);

		const employeeDoc = await employeeDocRef.get();

		if (!employeeDoc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"The manager/owner employee profile could not be found.",
			);
		}

		const employeeData = employeeDoc.data();
		if (
			requester.role === "manager" &&
			String(employeeData.role || "").toLowerCase() !== "worker"
		) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Managers can only reset worker PINs.",
			);
		}

		// Hash the PIN with a salt. 10 rounds is a standard, secure number.
		const salt = await bcrypt.genSalt(10);
		const pinHash = await bcrypt.hash(pinValue, salt);

		// Store the HASH, not the plain-text PIN
		await employeeDocRef.update({
			pinHash,
			pin: admin.firestore.FieldValue.delete(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(`Successfully set PIN for employee ${employeeId}.`);
		return { success: true };
	} catch (error) {
		console.error("Error setting manager PIN:", error);
		// Avoid propagating internal error details unless it's an HttpsError
		if (error instanceof functions.https.HttpsError) {
			throw error;
		}
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while setting the PIN.",
		);
	}
});

/**
 * Verifies an entered PIN against the stored hash for a given employee.
 * This is called by the client-side PIN pad.
 *
 * @param {object} data
 * @param {string} data.employeeId The ID of the employee whose PIN is being verified.
 * @param {string} data.pin The plain-text PIN entered by the user.
 */
/**
 * Verifies an entered PIN against the stored hash for a given employee.
 * This version correctly queries for the employee using their auth UID.
 *
 * @param {object} data
 * @param {string} data.restaurantId The ID of the restaurant where the employee works.
 * @param {string} data.employeeId The Authentication UID of the manager/owner.
 * @param {string} data.pin The plain-text PIN entered by the user.
 */
exports.verifyEmployeePin = functions.https.onCall(async (data, context) => {
	// This function can be called by any authenticated user on a restaurant device
	if (!context.auth) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"Authentication is required.",
		);
	}

	const { restaurantId, employeeId, pin } = data;
	if (!restaurantId || !employeeId || !pin) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant ID, Employee ID, and PIN are required.",
		);
	}

	try {
		const employeeRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);
		const employeeDoc = await employeeRef.get();

		if (!employeeDoc.exists) {
			console.error(
				`verifyEmployeePin: Employee doc not found at path: ${employeeRef.path}`,
			);
			return { success: false, message: "Invalid credentials." };
		}

		const employeeData = employeeDoc.data();
		if (employeeData.isActive === false) {
			return { success: false, message: "This employee is inactive." };
		}

		if (!employeeData.pinHash) {
			console.error(
				`verifyEmployeePin: PIN hash does not exist for employee ${employeeId}.`,
			);
			return { success: false, message: "No PIN is set for this manager." };
		}

		const pinMatches = await bcrypt.compare(String(pin), employeeData.pinHash);

		if (pinMatches) {
			console.log(`PIN verification successful for employee ${employeeId}.`);
			return {
				success: true,
				employee: {
					id: employeeDoc.id, // The unique document ID
					name: `${employeeData.firstName} ${employeeData.lastName}`,
					firstName: employeeData.firstName || "",
					lastName: employeeData.lastName || "",
					role: employeeData.role,
					jobTitle: employeeData.jobTitle || null,
					restaurantId,
					isActive: employeeData.isActive !== false,
				},
			};
		} else {
			console.log(`PIN verification FAILED for employee ${employeeId}.`);
			return { success: false, message: "Invalid credentials." };
		}
	} catch (error) {
		console.error("Error verifying PIN:", error);
		throw new functions.https.HttpsError(
			"internal",
			"An error occurred during PIN verification.",
		);
	}
});

/**
 * Creates a new employee document and a corresponding Firebase Auth user.
 * Allows the very first employee to be created by any authenticated user for that restaurant,
 * after which only managers/owners can add more.
 */
/**
 * Creates a new employee document in Firestore.
 * Now includes a 'jobTitle' for operational use.
 */
exports.addEmployee = functions.https.onCall(async (data, context) => {
	// 1. Authorization Check: Ensure the requester is an owner or manager.
	if (
		!context.auth ||
		!["owner", "manager"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to add employees.",
		);
	}

	// 2. Validate Input
	const { restaurantId, firstName, lastName, role, pin, jobTitle, staffId } =
		data;
	const normalizedRole = String(role || "")
		.trim()
		.toLowerCase();
	const normalizedJobTitle = String(jobTitle || "")
		.trim()
		.toLowerCase();
	const pinValue = String(pin || "").trim();

	if (!restaurantId || !firstName || !lastName || !role) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required employee details (name, role).",
		);
	}
	if (!["owner", "manager", "worker"].includes(normalizedRole)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Invalid employee role.",
		);
	}
	if (!/^\d{4,6}$/.test(pinValue)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"A 4-6 digit POS PIN is required.",
		);
	}
	if (normalizedRole === "worker" && !normalizedJobTitle) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Worker profiles require a job title.",
		);
	}
	if (
		context.auth.token.role === "manager" &&
		normalizedRole !== "worker"
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Managers can only create worker profiles.",
		);
	}

	const employeesRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("employees");
	const snapshot = await employeesRef.limit(1).get();
	const isFirstEmployee = snapshot.empty;
	const roleToSet = isFirstEmployee ? "owner" : normalizedRole;
	let requester = null;

	if (!isFirstEmployee) {
		requester = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "add employees",
		});
	}

	if (roleToSet === "owner" && !isFirstEmployee) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"The 'owner' role can only be assigned to the first employee.",
		);
	}
	if (requester && requester.role === "manager" && roleToSet !== "worker") {
		throw new functions.https.HttpsError(
			"permission-denied",
			"Managers can only create worker profiles.",
		);
	}

	try {
		let pinHash = null;

		// 🚨 THE FIX: Hash the PIN for EVERYONE, regardless of role.
		if (pinValue) {
			const salt = await bcrypt.genSalt(10);
			pinHash = await bcrypt.hash(pinValue, salt);
		}

		// 3. Create the employee document in the subcollection.
		const newEmployeeRef = employeesRef.doc(); // Auto-generate a unique ID
		await newEmployeeRef.set({
			firstName,
			lastName,
			role: roleToSet,
			jobTitle: roleToSet === "worker" ? normalizedJobTitle : null,
			pinHash, // Now every employee gets their secure hash saved!
			restaurantId,
			isActive: true,
			// Assign auth uid only to the first employee (the owner)
			uid: isFirstEmployee ? context.auth.uid : null,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
		});

		console.log(
			`Successfully added employee ${newEmployeeRef.id} with role ${roleToSet}.`,
		);
		// Return the unique Firestore document ID
		return { success: true, employeeId: newEmployeeRef.id };
	} catch (error) {
		console.error("Error adding employee:", error);
		throw new functions.https.HttpsError(
			"internal",
			error.message || "Could not add new employee.",
		);
	}
});

exports.updateEmployee = functions.https.onCall(async (data, context) => {
	// 1. Security Check
	if (!context.auth) {
		throw new functions.https.HttpsError("unauthenticated", "Not logged in.");
	}

	const {
		restaurantId,
		employeeId,
		firstName,
		lastName,
		role,
		jobTitle,
		pin,
		staffId,
	} = data;
	const roleToSet = String(role || "")
		.trim()
		.toLowerCase();
	const jobTitleToSet = String(jobTitle || "")
		.trim()
		.toLowerCase();

	if (!restaurantId || !employeeId) {
		throw new functions.https.HttpsError("invalid-argument", "Missing IDs.");
	}
	if (!firstName || !lastName || !roleToSet) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required employee details.",
		);
	}
	if (!["owner", "manager", "worker"].includes(roleToSet)) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Invalid employee role.",
		);
	}
	if (roleToSet === "worker" && !jobTitleToSet) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Worker profiles require a job title.",
		);
	}

	try {
		const requester = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "update employees",
		});
		const employeeRef = admin
			.firestore()
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);
		const employeeDoc = await employeeRef.get();

		if (!employeeDoc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Employee profile not found.",
			);
		}

		const existingRole = String(employeeDoc.data().role || "")
			.trim()
			.toLowerCase();
		if (roleToSet === "owner" && existingRole !== "owner") {
			throw new functions.https.HttpsError(
				"permission-denied",
				"The owner role cannot be assigned from employee management.",
			);
		}
		if (
			requester.role === "manager" &&
			(existingRole !== "worker" || roleToSet !== "worker")
		) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Managers can only update worker profiles.",
			);
		}

		const updateData = {
			firstName,
			lastName,
			role: roleToSet,
			jobTitle: roleToSet === "worker" ? jobTitleToSet : null,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			// Clean up legacy fields
			pin: admin.firestore.FieldValue.delete(),
			isManager: admin.firestore.FieldValue.delete(),
			position: admin.firestore.FieldValue.delete(),
		};

		// 🚨 BCRYPT HASHING LOGIC
		if (pin && pin.trim() !== "") {
			const rawPin = String(pin).trim();
			if (!/^\d{4,6}$/.test(rawPin)) {
				throw new functions.https.HttpsError(
					"invalid-argument",
					"A 4-6 digit POS PIN is required.",
				);
			}

			// Generate the secure hash
			const hashedPin = await bcrypt.hash(rawPin, 10);

			updateData.pinHash = hashedPin; // Save the bcrypt hash for the login screen
		}

		// Execute Firestore Update
		await employeeRef.update(updateData);

		return { success: true };
	} catch (error) {
		console.error("Update Error:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError("internal", "Failed to update.");
	}
});

/**
 * Deletes an employee's Firestore document and their Firebase Auth account.
 */
exports.deleteEmployee = functions.https.onCall(async (data, context) => {
	// 1. Authorization Check
	if (
		!context.auth ||
		!["owner", "manager"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to delete employees.",
		);
	}

	const { restaurantId, employeeId, staffId } = data;
	if (!restaurantId || !employeeId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Restaurant and Employee IDs are required.",
		);
	}

	try {
		const requester = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			action: "delete employees",
		});
		const employeeRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(employeeId);
		const employeeDoc = await employeeRef.get();

		if (!employeeDoc.exists) {
			throw new functions.https.HttpsError(
				"not-found",
				"Employee profile not found.",
			);
		}

		const employeeRole = String(employeeDoc.data().role || "")
			.trim()
			.toLowerCase();
		if (employeeRole === "owner") {
			throw new functions.https.HttpsError(
				"permission-denied",
				"The owner profile cannot be deleted from the POS.",
			);
		}
		if (requester.role === "manager" && employeeRole !== "worker") {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Managers can only delete worker profiles.",
			);
		}

		// 2. Safely Attempt to Delete Firebase Auth User
		try {
			await admin.auth().deleteUser(employeeId);
			console.log(
				`Successfully deleted Firebase Auth record for ${employeeId}`,
			);
		} catch (authError) {
			// If they are already missing from Auth, we don't care. Just log it and move forward.
			if (authError.code === "auth/user-not-found") {
				console.log(
					`Auth record missing for ${employeeId}. Proceeding to wipe Firestore document.`,
				);
			} else {
				// If it's a real error (like missing permissions), throw it so it stops execution.
				throw authError;
			}
		}

		// 3. Delete the Firestore Document
		// Since we are only deleting one document, we can use a direct .delete() instead of a batch
		await employeeRef.delete();

		console.log(
			`✅ Successfully removed employee ${employeeId} from restaurant ${restaurantId}`,
		);
		return { success: true };
	} catch (error) {
		console.error("Error deleting employee:", error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"Could not delete employee.",
			error.message,
		);
	}
});

/**
 * Sets a custom claim for a user's role at a specific restaurant.
 * Only authenticated users with a 'manager' or 'owner' role can call this.
 *
 * @param {object} data - The data object from the client.
 * @param {string} data.targetUserId - The UID of the employee whose role is being set.
 * @param {string} data.role - The new role to assign (e.g., 'owner', 'manager', 'worker').
 * @param {string} data.restaurantId - The ID of the restaurant they belong to.
 */
exports.setEmployeeRole = functions.https.onCall(async (data, context) => {
	// Check if the user making the request is authorized
	if (
		!context.auth ||
		!["manager", "owner"].includes(context.auth.token.role)
	) {
		throw new functions.https.HttpsError(
			"permission-denied",
			"You must be a manager or owner to set employee roles.",
		);
	}

	const { targetUserId, role, restaurantId } = data;
	const validRoles = ["owner", "manager", "worker"];

	if (!validRoles.includes(role) || !targetUserId || !restaurantId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Invalid data provided.",
		);
	}

	try {
		console.log(
			`Setting custom claims for user ${targetUserId} to role: ${role}, restaurantId: ${restaurantId}`,
		);
		// --- THIS IS THE FIX ---
		// 1. Set the custom claims on the target user's Firebase Auth account.
		// This embeds the role and restaurantId directly into their auth token.
		await admin.auth().setCustomUserClaims(targetUserId, {
			role: role,
			restaurantId: restaurantId,
		});

		// 2. For consistency, also update their role in their Firestore document.
		const userDocRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(targetUserId);
		await userDocRef.update({
			role: role,
		});

		console.log(`Successfully set role '${role}' for user ${targetUserId}.`);
		return { success: true, message: `Role has been updated to ${role}.` };
	} catch (error) {
		console.error("Error setting custom claims:", error);
		throw new functions.https.HttpsError(
			"internal",
			"An error occurred while setting the user role.",
			error.message,
		);
	}
});

/**
 * Allows authorized staff to forcibly clear a table.
 * Marks associated parties and kitchen/bar orders as VOIDED to preserve history
 * while instantly clearing them from the Active Tables, Chef's Q, and Bar Q.
 */
exports.forceClearTable = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}

	const {
		restaurantId,
		tableId,
		checkInId,
		customerId,
		partyId,
		staffId,
		staffName,
	} = data;

	if (!restaurantId || !tableId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Missing required IDs to clear the table.",
		);
	}

	const tableRef = db
		.collection("restaurants")
		.doc(restaurantId)
		.collection("tables")
		.doc(tableId);

	try {
		const staffMember = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			allowedJobTitles: ["support"],
			action: "force clear tables",
		});

		// --- READ PHASE (Outside Transaction) ---
		let basketItemsSnapshot = { empty: true };
		let activeOrdersSnapshot = { empty: true };

		if (checkInId && checkInId !== "legacy_skip") {
			const basketItemsQuery = db
				.collection("baskets")
				.where("checkInId", "==", checkInId);
			basketItemsSnapshot = await basketItemsQuery.get();
		}

		if (partyId) {
			const activeOrdersQuery = db
				.collection("kitchen_orders")
				.where("partyId", "==", partyId)
				.where("overallStatus", "==", "active");

			activeOrdersSnapshot = await activeOrdersQuery.get();
		}

		// --- TRANSACTION PHASE ---
		await db.runTransaction(async (transaction) => {
			// READ 1: Get check-in document
			let associatedPartyId = null;
			let checkInRef = null;
			let checkInDoc = { exists: false };

			if (checkInId && checkInId !== "legacy_skip") {
				checkInRef = db.collection("checkIns").doc(checkInId);
				checkInDoc = await transaction.get(checkInRef);
				associatedPartyId = checkInDoc.exists
					? checkInDoc.data().associatedPartyId
					: null;
			}

			// 🚨 NEW READ 2: Safely check if the customer document actually exists
			let customerRef = null;
			let customerDoc = { exists: false };
			const ignoredCustomerIds = [
				"walk_in",
				"walk_in_guest",
				"guest",
				"null",
				"undefined",
			];

			if (
				customerId &&
				!ignoredCustomerIds.includes(String(customerId).toLowerCase())
			) {
				customerRef = db.collection("customers").doc(customerId);
				customerDoc = await transaction.get(customerRef);
			}

			const targetPartyId = partyId || associatedPartyId;
			let partyRef = null;
			let partyDoc = { exists: false };
			let partyData = {};

			if (targetPartyId) {
				partyRef = db.collection("parties").doc(targetPartyId);
				partyDoc = await transaction.get(partyRef);
				partyData = partyDoc.exists ? partyDoc.data() || {} : {};
			}

			const usersToFree = [];
			const addUserToFree = (uid) => {
				if (!uid) return;
				const normalizedUid = String(uid).toLowerCase();
				if (
					ignoredCustomerIds.includes(normalizedUid) ||
					usersToFree.includes(uid)
				) {
					return;
				}
				usersToFree.push(uid);
			};

			addUserToFree(customerId);
			addUserToFree(partyData.hostUserId);
			addUserToFree(partyData.currentCustomerId);
			addUserToFree(partyData.customerId);

			if (Array.isArray(partyData.guestPips)) {
				partyData.guestPips.forEach((pip) =>
					addUserToFree(pip && pip.userId),
				);
			}

			[
				...(Array.isArray(partyData.guestUserIds)
					? partyData.guestUserIds
					: []),
				...(Array.isArray(partyData.memberUids) ? partyData.memberUids : []),
			].forEach(addUserToFree);

			// --- All reads are now complete. Proceed with writes. ---

			// WRITE 1: Delete legacy basket items
			if (!basketItemsSnapshot.empty) {
				basketItemsSnapshot.forEach((doc) => {
					transaction.delete(doc.ref);
				});
			}

			// WRITE 2: Void all active kitchen/bar tickets
			if (!activeOrdersSnapshot.empty) {
				activeOrdersSnapshot.forEach((doc) => {
					transaction.update(doc.ref, {
						overallStatus: "voided",
						status: "voided",
						voidedReason: "manager_force_clear_table",
						voidedAt: admin.firestore.FieldValue.serverTimestamp(),
					});
				});
			}

			// WRITE 3: Free the physical table
			transaction.update(tableRef, {
				status: "available",
				currentCheckInId: null,
				currentCustomerId: null,
				seatedAt: null,
			});

			// WRITE 4: Complete the check-in
			if (checkInDoc.exists && checkInRef) {
				transaction.update(checkInRef, {
					status: "COMPLETED",
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			// 🚨 UPDATED WRITE 5: Only update the customer if the document exists in Firestore
			if (customerDoc.exists && customerRef) {
				addUserToFree(customerRef.id);
			}

			usersToFree.forEach((uid) => {
				transaction.set(
					db.collection("customers").doc(uid),
					{
						activeCheckIn: null,
						activePartyId: null,
						activeRestaurantId: null,
						...(targetPartyId && {
							partyIds: admin.firestore.FieldValue.arrayRemove(
								targetPartyId,
							),
						}),
					},
					{ merge: true },
				);
			});

			// WRITE 6: Void the Party Document
			if (targetPartyId && partyRef) {
				transaction.set(
					partyRef,
					{
						status: "voided",
						clearedAt: admin.firestore.FieldValue.serverTimestamp(),
						clearedReason: "manager_force_clear",
						clearedBy: {
							userId: context.auth.uid,
							staffId: staffMember.id || staffId || null,
							name: staffName || staffMember.name || null,
							role: staffMember.role || null,
							jobTitle: staffMember.jobTitle || null,
						},
					},
					{ merge: true },
				);

				// Preserve the shared basket for audit instead of deleting it.
				const sharedBasketRef = db
					.collection("shared_baskets")
					.doc(targetPartyId);
				transaction.set(
					sharedBasketRef,
					{
						status: "archived_voided",
						archivedForAudit: true,
						archivedAt: admin.firestore.FieldValue.serverTimestamp(),
						voidedAt: admin.firestore.FieldValue.serverTimestamp(),
						voidedReason: "manager_force_clear",
						closeoutId: targetPartyId,
						lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
			}
		});

		return {
			success: true,
			message:
				"Table, party, and kitchen tickets successfully voided and cleared.",
		};
	} catch (error) {
		console.error(`Error force-clearing table ${tableId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while clearing the table.",
		);
	}
});

exports.assignPartyServer = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}

	const { partyId, serverId, staffId, staffName } = data || {};

	if (!partyId || !serverId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID and server ID are required.",
		);
	}

	try {
		const partyRef = db.collection("parties").doc(partyId);
		const partyDoc = await partyRef.get();

		if (!partyDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}

		const partyData = partyDoc.data() || {};
		const restaurantId = partyData.restaurantId;
		const assignedBy = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			allowedJobTitles: ["host", "server"],
			action: "assign servers",
		});

		if (!["pending", "AWAITING_TABLE", "active", "checkedOut"].includes(partyData.status)) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Server can only be assigned to an open table.",
			);
		}

		const serverRef = db
			.collection("restaurants")
			.doc(restaurantId)
			.collection("employees")
			.doc(serverId);
		const serverDoc = await serverRef.get();

		if (!serverDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Server not found.");
		}

		const serverData = serverDoc.data() || {};
		const serverRole = String(serverData.role || "").toLowerCase();
		const serverJobTitle = String(serverData.jobTitle || "").toLowerCase();

		if (serverData.isActive === false) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Cannot assign an inactive server.",
			);
		}

		if (
			serverRole !== "owner" &&
			serverRole !== "manager" &&
			!(serverRole === "worker" && serverJobTitle === "server")
		) {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Selected employee is not eligible to serve tables.",
			);
		}

		const serverName =
			serverData.name ||
			`${serverData.firstName || ""} ${serverData.lastName || ""}`.trim() ||
			"Server";
		const assignment = {
			id: serverDoc.id,
			name: serverName,
		};
		const assignedByAudit = {
			userId: context.auth.uid,
			staffId: assignedBy.id || staffId || null,
			name: staffName || assignedBy.name || null,
			role: assignedBy.role || null,
			jobTitle: assignedBy.jobTitle || null,
		};

		await partyRef.set(
			{
				server: assignment,
				serverAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
				serverAssignedBy: assignedByAudit,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return { success: true, server: assignment };
	} catch (error) {
		console.error(`Error assigning server for party ${partyId}:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while assigning the server.",
		);
	}
});

exports.acknowledgePartyServiceRequest = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be staff and authenticated.",
			);
		}

		const { partyId, staffId, staffName } = data || {};

		if (!partyId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID is required.",
			);
		}

		try {
			const partyRef = db.collection("parties").doc(partyId);
			const partyDoc = await partyRef.get();

			if (!partyDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Party not found.");
			}

			const partyData = partyDoc.data() || {};
			const acknowledgedBy = await assertRestaurantPermission({
				db,
				context,
				restaurantId: partyData.restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["host", "server", "support"],
				action: "acknowledge service requests",
			});

			if (
				acknowledgedBy.role === "worker" &&
				acknowledgedBy.jobTitle === "server" &&
				(!partyData.server || partyData.server.id !== acknowledgedBy.id)
			) {
				throw new functions.https.HttpsError(
					"permission-denied",
					"Servers can only acknowledge requests for their assigned tables.",
				);
			}

			await partyRef.set(
				{
					serviceRequested: false,
					serviceRequestStatus: "acknowledged",
					serviceAcknowledgedAt:
						admin.firestore.FieldValue.serverTimestamp(),
					serviceAcknowledgedBy: {
						userId: context.auth.uid,
						staffId: acknowledgedBy.id || staffId || null,
						name: staffName || acknowledgedBy.name || null,
						role: acknowledgedBy.role || null,
						jobTitle: acknowledgedBy.jobTitle || null,
					},
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);

			return { success: true };
		} catch (error) {
			console.error(
				`Error acknowledging service request for party ${partyId}:`,
				error,
			);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while acknowledging the request.",
			);
		}
	},
);

exports.updateKitchenOrderStationStatus = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be staff and authenticated.",
			);
		}

		const { orderId, station, status, staffId, staffName, itemId } = data || {};
		const validStations = ["kitchen", "bar"];
		const validStatuses = ["new", "preparing", "ready"];

		if (
			!orderId ||
			!validStations.includes(station) ||
			!validStatuses.includes(status)
		) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID, station, and valid status are required.",
			);
		}

		try {
			const orderRef = db.collection("kitchen_orders").doc(orderId);
			const orderDoc = await orderRef.get();

			if (!orderDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Ticket not found.");
			}

			const orderData = orderDoc.data() || {};
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId: orderData.restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: station === "bar" ? ["bartender"] : ["chef"],
				action: `update ${station} tickets`,
			});

			await db.runTransaction(async (transaction) => {
				const currentOrderDoc = await transaction.get(orderRef);
				const currentOrderData = currentOrderDoc.data() || {};
				const currentItems = Array.isArray(currentOrderData.items)
					? currentOrderData.items
					: [];
				const shouldSyncSharedBasket =
					currentOrderData.partyId &&
					currentOrderData.fulfillmentType !== "hotel_pickup";
				const basketRef = shouldSyncSharedBasket
					? db.collection("shared_baskets").doc(currentOrderData.partyId)
					: null;
				const basketDoc = basketRef ? await transaction.get(basketRef) : null;

				const stationItemMatcher = (item) => {
					if (!item) return false;
					if (item.destination === station) return true;
					if (station === "kitchen") {
						return (
							Array.isArray(item.kitchenModifiers) &&
							item.kitchenModifiers.length > 0
						);
					}
					if (station === "bar") {
						return (
							Array.isArray(item.barModifiers) && item.barModifiers.length > 0
						);
					}
					return false;
				};

				const matchingItems = currentItems.filter(stationItemMatcher);
				if (matchingItems.length === 0) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						`Ticket has no ${station} items to update.`,
					);
				}

				if (itemId && !matchingItems.some((item) => item.id === itemId)) {
					throw new functions.https.HttpsError(
						"not-found",
						"Ticket item not found for this station.",
					);
				}

				const updatedItems = currentItems.map((item) => {
					const shouldUpdateItem = itemId
						? item.id === itemId
						: stationItemMatcher(item);

					if (!shouldUpdateItem) return item;

					return {
						...item,
						stationStatuses: {
							...(item.stationStatuses || {}),
							[station]: status,
						},
					};
				});

				const updatedMatchingItems = updatedItems.filter(stationItemMatcher);
				const updatedItemStatuses = updatedMatchingItems.map(
					(item) =>
						(item.stationStatuses && item.stationStatuses[station]) || "new",
				);
				const aggregateStationStatus = updatedItemStatuses.every(
					(itemStatus) => itemStatus === "ready",
				)
					? "ready"
					: updatedItemStatuses.some(
							(itemStatus) =>
								itemStatus === "preparing" || itemStatus === "ready",
						)
						? "preparing"
						: "new";

				const updatePayload = {
					items: updatedItems,
					[`stationStatuses.${station}`]: aggregateStationStatus,
					[`stationUpdatedAt.${station}`]:
						admin.firestore.FieldValue.serverTimestamp(),
					[`stationUpdatedBy.${station}`]: {
						userId: context.auth.uid,
						staffId: staffMember.id || staffId || null,
						name: staffName || staffMember.name || null,
						role: staffMember.role || null,
						jobTitle: staffMember.jobTitle || null,
					},
				};

				transaction.update(orderRef, updatePayload);

				if (basketRef) {
					const updatedItemIds = new Set(
						updatedMatchingItems
							.filter((item) => (itemId ? item.id === itemId : true))
							.map((item) => item.id)
							.filter(Boolean),
					);
					const basketData =
						basketDoc && basketDoc.exists ? basketDoc.data() || {} : {};
					const basketItems = Array.isArray(basketData.items)
						? basketData.items
						: [];
					const syncedBasketItems =
						updatedItemIds.size > 0
							? basketItems.map((item) => {
									if (!updatedItemIds.has(item.id)) return item;

									return {
										...item,
										stationStatuses: {
											...(item.stationStatuses || {}),
											[station]: status,
										},
									};
								})
							: basketItems;

					transaction.set(
						basketRef,
						{
							items: syncedBasketItems,
							[`ticketStatuses.${orderId}.${station}`]:
								aggregateStationStatus,
							lastKitchenUpdate: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				}
			});

			return { success: true };
		} catch (error) {
			console.error(`Error updating station status for ticket ${orderId}:`, error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while updating the ticket.",
			);
		}
	},
);

exports.completePickupOrderHandoff = functions.https.onCall(
	async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be staff and authenticated.",
			);
		}

		const { orderId, staffId, staffName } = data || {};

		if (!orderId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Order ID is required.",
			);
		}

		try {
			const kitchenOrderRef = db.collection("kitchen_orders").doc(orderId);
			const kitchenOrderDoc = await kitchenOrderRef.get();

			if (!kitchenOrderDoc.exists) {
				throw new functions.https.HttpsError("not-found", "Pickup ticket not found.");
			}

			const kitchenOrderData = kitchenOrderDoc.data() || {};
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId: kitchenOrderData.restaurantId,
				employeeId: staffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["host", "support"],
				action: "complete pickup handoff",
			});

			if (kitchenOrderData.fulfillmentType !== "hotel_pickup") {
				throw new functions.https.HttpsError(
					"failed-precondition",
					"Only pickup orders can be handed off from this queue.",
				);
			}

			const handedOffBy = {
				userId: context.auth.uid,
				staffId: staffMember.id || staffId || null,
				name: staffName || staffMember.name || null,
				role: staffMember.role || null,
				jobTitle: staffMember.jobTitle || null,
			};

			await db.runTransaction(async (transaction) => {
				transaction.set(
					kitchenOrderRef,
					{
						overallStatus: "completed",
						status: "completed",
						completedAt: admin.firestore.FieldValue.serverTimestamp(),
						handedOffAt: admin.firestore.FieldValue.serverTimestamp(),
						handedOffBy,
					},
					{ merge: true },
				);

				const orderRef = db.collection("orders").doc(orderId);
				transaction.set(
					orderRef,
					{
						orderStatus: "completed",
						completedAt: admin.firestore.FieldValue.serverTimestamp(),
						handedOffAt: admin.firestore.FieldValue.serverTimestamp(),
						handedOffBy,
					},
					{ merge: true },
				);

				if (kitchenOrderData.partyId) {
					const partyRef = db.collection("parties").doc(kitchenOrderData.partyId);
					transaction.set(
						partyRef,
						{
							status: "completed",
							closedAt: admin.firestore.FieldValue.serverTimestamp(),
							closedByUserId: context.auth.uid,
							closedBy: handedOffBy,
						},
						{ merge: true },
					);
				}
			});

			return { success: true };
		} catch (error) {
			console.error(`Error completing pickup handoff for ${orderId}:`, error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"An unexpected error occurred while completing pickup handoff.",
			);
		}
	},
);

/**
 * Marks a paid/checked-out party table as cleaned and ready for the next guest.
 * This is the normal end-of-shift/table-turn cleanup path after closeout.
 */
exports.markPartyTableClean = functions.https.onCall(async (data, context) => {
	if (!context.auth || !context.auth.uid) {
		throw new functions.https.HttpsError(
			"unauthenticated",
			"User must be staff and authenticated.",
		);
	}

	const { partyId, staffId, staffName } = data || {};

	if (!partyId) {
		throw new functions.https.HttpsError(
			"invalid-argument",
			"Party ID is required.",
		);
	}

	try {
		const partyRef = db.collection("parties").doc(partyId);
		const partyDoc = await partyRef.get();

		if (!partyDoc.exists) {
			throw new functions.https.HttpsError("not-found", "Party not found.");
		}

		const partyData = partyDoc.data() || {};
		const restaurantId = partyData.restaurantId;

		const staffMember = await assertRestaurantPermission({
			db,
			context,
			restaurantId,
			employeeId: staffId,
			allowedRoles: ["owner", "manager"],
			allowedJobTitles: ["server", "support"],
			action: "mark tables clean",
		});

		if (partyData.status !== "checkedOut") {
			throw new functions.https.HttpsError(
				"failed-precondition",
				"Only checked-out tables can be marked clean.",
			);
		}

		const tableId =
			partyData.table && partyData.table.id
				? partyData.table.id
				: partyData.tableId || null;
		const customerId =
			partyData.hostUserId ||
			partyData.currentCustomerId ||
			partyData.customerId ||
			null;
		const cleanedBy = {
			userId: context.auth.uid,
			staffId: staffMember.id || staffId || null,
			name: staffName || staffMember.name || null,
			role: staffMember.role || null,
			jobTitle: staffMember.jobTitle || null,
		};

		await db.runTransaction(async (transaction) => {
			transaction.set(
				partyRef,
				{
					status: "completed",
					clearedAt: admin.firestore.FieldValue.serverTimestamp(),
					cleanedAt: admin.firestore.FieldValue.serverTimestamp(),
					cleanedBy,
				},
				{ merge: true },
			);

			if (tableId) {
				const tableRef = db
					.collection("restaurants")
					.doc(restaurantId)
					.collection("tables")
					.doc(tableId);
				transaction.set(
					tableRef,
					{
						status: "available",
						currentCheckInId: null,
						currentCustomerId: null,
						seatedAt: null,
						cleanedAt: admin.firestore.FieldValue.serverTimestamp(),
						cleanedBy,
					},
					{ merge: true },
				);
			}

			if (
				customerId &&
				!["walk_in_guest", "walk_in", "guest"].includes(
					String(customerId).toLowerCase(),
				)
			) {
				const customerRef = db.collection("customers").doc(customerId);
				transaction.set(
					customerRef,
					{
						activePartyId: null,
						activeRestaurantId: null,
						activeCheckIn: null,
						partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
					},
					{ merge: true },
				);
			}
		});

		return { success: true };
	} catch (error) {
		console.error(`Error marking party ${partyId} clean:`, error);
		if (error instanceof functions.https.HttpsError) throw error;
		throw new functions.https.HttpsError(
			"internal",
			"An unexpected error occurred while marking the table clean.",
		);
	}
});
// Listen for changes in the 'menuItems' collection
exports.autoTranslateMenuItem = functions.firestore
	.document("menuItems/{itemId}")
	.onWrite(async (change, context) => {
		const newData = change.after.exists ? change.after.data() : null;
		const oldData = change.before.exists ? change.before.data() : null;

		// 1. Exit if deleted
		if (!newData) return null;

		// 2. Exit if 'name' and 'description' haven't changed (Prevents Infinite Loops)
		if (
			oldData &&
			newData.name === oldData.name &&
			newData.description === oldData.description
		) {
			return null;
		}

		// 3. Exit if this update was triggered by our own translation (Prevents Infinite Loops)
		// We check if the update only added the '_en' or '_es' fields
		if (
			oldData &&
			(newData.name_en !== oldData.name_en ||
				newData.description_en !== oldData.description_en) &&
			newData.name === oldData.name
		) {
			return null;
		}

		const promises = [];
		const updates = {};

		try {
			// --- TRANSLATE NAME ---
			if (newData.name) {
				// Detect language of the name (e.g., 'es' for Spanish)
				let [detection] = await translate.detect(newData.name);
				let sourceLang = detection.language;

				// If it's Spanish, translate to English. If English, to Spanish.
				let targetLang = sourceLang === "es" ? "en" : "es";

				let [translatedName] = await translate.translate(
					newData.name,
					targetLang,
				);

				updates[`name_${targetLang}`] = translatedName;
				updates[`name_${sourceLang}`] = newData.name; // Keep the original tagged correctly
			}

			// --- TRANSLATE DESCRIPTION ---
			if (newData.description) {
				let [detection] = await translate.detect(newData.description);
				let sourceLang = detection.language;
				let targetLang = sourceLang === "es" ? "en" : "es";

				let [translatedDesc] = await translate.translate(
					newData.description,
					targetLang,
				);

				updates[`description_${targetLang}`] = translatedDesc;
				updates[`description_${sourceLang}`] = newData.description;
			}

			// 4. Write back to Firestore
			if (Object.keys(updates).length > 0) {
				return change.after.ref.update(updates);
			}
		} catch (error) {
			console.error("Translation Error:", error);
		}

		return null;
	});

exports.closePartyTable = functions
	.runWith({ memory: "512MB" })
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw new functions.https.HttpsError(
				"unauthenticated",
				"User must be authorized.",
			);
		}

		const {
			partyId,
			paymentMethod = "manual",
			tenderType = paymentMethod,
			receiptEmail,
			externalReference = "",
			terminalPaymentIntentId = "",
			cashReceived = 0,
			tipAmount = 0,
			closeoutNotes = "",
			closedByName = "",
			closedByStaffId = "",
			closeoutItemIds = [],
			closeoutSeatIds = [],
		} = data;

		if (!partyId) {
			throw new functions.https.HttpsError(
				"invalid-argument",
				"Party ID is required.",
			);
		}

		try {
			const permissionPartyDoc = await db.collection("parties").doc(partyId).get();
			if (!permissionPartyDoc.exists) {
				throw new functions.https.HttpsError(
					"not-found",
					"Party document not found.",
				);
			}

			const permissionPartyData = permissionPartyDoc.data() || {};
			const staffMember = await assertRestaurantPermission({
				db,
				context,
				restaurantId: permissionPartyData.restaurantId,
				employeeId: closedByStaffId,
				allowedRoles: ["owner", "manager"],
				allowedJobTitles: ["server"],
				action: "close tables",
			});
			const generatedReadableOrderId = await generateOrderId(
				permissionPartyData.restaurantId,
			);

			return await db.runTransaction(async (transaction) => {
				// ==========================================
				// 1. READS
				// ==========================================
				const partyRef = db.collection("parties").doc(partyId);
				const partyDoc = await transaction.get(partyRef);

				if (!partyDoc.exists) {
					throw new functions.https.HttpsError(
						"not-found",
						"Party document not found.",
					);
				}

				const partyData = partyDoc.data() || {};

				if (partyData.status === "completed") {
					return { success: true, message: "Table is already closed." };
				}

				const basketRef = db.collection("shared_baskets").doc(partyId);
				const basketDoc = await transaction.get(basketRef);
				let basketData = { items: [] };

				if (basketDoc.exists) {
					basketData = basketDoc.data() || { items: [] };
				}

				const kitchenOrdersQuery = db
					.collection("kitchen_orders")
					.where("partyId", "==", partyId);
				const kitchenOrdersSnap = await transaction.get(kitchenOrdersQuery);
				const orderRef = db.collection("orders").doc(partyId);
				const existingOrderDoc = await transaction.get(orderRef);
				const readableOrderId =
					existingOrderDoc.exists &&
					existingOrderDoc.data() &&
					existingOrderDoc.data().readableOrderId
						? existingOrderDoc.data().readableOrderId
						: generatedReadableOrderId;

				// ==========================================
				// 2. DATA PREP & CALCULATIONS
				// ==========================================
				const restaurantId = partyData.restaurantId || null;
				const tableId =
					partyData.table && partyData.table.id ? partyData.table.id : null;
				const restaurantName =
					partyData.restaurantName || partyData.name || "Scerv Partner";
				let restaurantData = {};

				if (restaurantId) {
					const restaurantRef = db.collection("restaurants").doc(restaurantId);
					const restaurantDoc = await transaction.get(restaurantRef);
					restaurantData = restaurantDoc.exists
						? restaurantDoc.data() || {}
						: {};
				}

				const allItems = Array.isArray(basketData.items)
					? basketData.items
					: [];
				const officiallyOrderedItems = allItems.filter(
					(item) => item && item.status && item.status !== "new",
				);

				let restaurantTaxRate = Number(restaurantData.taxRate || 0);
				if (isNaN(restaurantTaxRate)) restaurantTaxRate = 0;
				if (restaurantTaxRate > 1) restaurantTaxRate = restaurantTaxRate / 100;

				const paidItemIds = new Set(
					officiallyOrderedItems
						.filter(
							(item) =>
								item.paymentStatus === "paid" ||
								item.closeoutStatus === "paid",
						)
						.map((item) => item.id)
						.filter(Boolean),
				);
				const unpaidItems = officiallyOrderedItems.filter(
					(item) => item && item.id && !paidItemIds.has(item.id),
				);
				const requestedItemIdSet = new Set(
					(Array.isArray(closeoutItemIds) ? closeoutItemIds : [])
						.map((id) => String(id || "").trim())
						.filter(Boolean),
				);
				const requestedSeatIdSet = new Set(
					(Array.isArray(closeoutSeatIds) ? closeoutSeatIds : [])
						.map((id) => String(id || "").trim())
						.filter(Boolean),
				);
				let selectedCloseoutItems = unpaidItems;

				if (requestedItemIdSet.size > 0) {
					selectedCloseoutItems = unpaidItems.filter((item) =>
						requestedItemIdSet.has(item.id),
					);
				} else if (requestedSeatIdSet.size > 0) {
					selectedCloseoutItems = unpaidItems.filter((item) =>
						requestedSeatIdSet.has(getRestaurantSeatIdForItem(item)),
					);
				}

				if (selectedCloseoutItems.length === 0) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"No unpaid items were selected for closeout.",
					);
				}

				const selectedCloseoutItemIds = selectedCloseoutItems
					.map((item) => item.id)
					.filter(Boolean);
				const selectedCloseoutItemIdSet = new Set(selectedCloseoutItemIds);
				const selectedCloseoutSeatIds = [
					...new Set(selectedCloseoutItems.map(getRestaurantSeatIdForItem)),
				];
				const selectedCloseoutSeats = selectedCloseoutSeatIds.map((seatId) => {
					const seatItem = selectedCloseoutItems.find(
						(item) => getRestaurantSeatIdForItem(item) === seatId,
					);
					return {
						id: seatId,
						name: getRestaurantSeatNameForItem(seatItem),
					};
				});
				const remainingUnpaidItemsAfterPayment = unpaidItems.filter(
					(item) => !selectedCloseoutItemIdSet.has(item.id),
				);
				const isTableFullyPaid = remainingUnpaidItemsAfterPayment.length === 0;
				const closeoutScope = isTableFullyPaid ? "final" : "partial";
				const {
					subtotalCents,
					originalSubtotalCents,
					taxAmountCents,
					discountTotalCents,
				} = calculateRestaurantCloseoutTotals(
					selectedCloseoutItems,
					restaurantTaxRate,
				);

				// Manual/external closeout business rule:
				// - Cash/external terminal: no Scerv/platform fee
				// - Stripe Terminal: customer pays the bill total; restaurant absorbs
				//   the configured terminal application fee from payout
				// - Staff-entered tips pass through to the restaurant before fees
				// - Stripe Terminal tips are selected on the reader and stored with the captured payment
				let gratuityAmountCents = Math.max(0, Math.round(Number(tipAmount) || 0));
				const platformFeeCents = 0;
				let processorFeeCents = 0;
				const cashReceivedCents = Math.max(
					0,
					Math.round(Number(cashReceived) || 0),
				);

				let totalPriceCents =
					subtotalCents +
					taxAmountCents +
					gratuityAmountCents +
					platformFeeCents;
				let restaurantGrossAmountCents = totalPriceCents;
				const manualPaymentProcessor =
					paymentMethod === "cash"
						? "cash"
						: paymentMethod === "stripe_terminal"
							? "stripe"
							: "external";
				const changeDueCents =
					paymentMethod === "cash"
						? Math.max(0, cashReceivedCents - totalPriceCents)
						: 0;

				if (paymentMethod === "cash" && cashReceivedCents < totalPriceCents) {
					throw new functions.https.HttpsError(
						"failed-precondition",
						"Cash received is less than the table total.",
					);
				}

				if (paymentMethod === "external_terminal" && !String(externalReference || "").trim()) {
					throw new functions.https.HttpsError(
						"invalid-argument",
						"Terminal authorization or reference code is required.",
					);
				}

				let terminalPaymentRef = null;
				let terminalPaymentData = null;
				const resolvedTerminalPaymentIntentId =
					String(terminalPaymentIntentId || externalReference || "").trim();
				if (paymentMethod === "stripe_terminal") {
					if (!resolvedTerminalPaymentIntentId) {
						throw new functions.https.HttpsError(
							"invalid-argument",
							"Stripe Terminal payment intent ID is required.",
						);
					}

					terminalPaymentRef = db
						.collection("terminal_payments")
						.doc(resolvedTerminalPaymentIntentId);
					const terminalPaymentDoc = await transaction.get(terminalPaymentRef);
					if (!terminalPaymentDoc.exists) {
						throw new functions.https.HttpsError(
							"failed-precondition",
							"Terminal payment has not been recorded yet.",
						);
					}

					terminalPaymentData = terminalPaymentDoc.data() || {};
					const terminalStatus =
						terminalPaymentData.paymentStatus || terminalPaymentData.status;
					if (
						terminalPaymentData.partyId !== partyId ||
						!["paid", "succeeded"].includes(terminalStatus)
					) {
						throw new functions.https.HttpsError(
							"failed-precondition",
							"Terminal payment has not succeeded for this table.",
						);
					}

					if (terminalPaymentData.closeoutFinalized === true) {
						throw new functions.https.HttpsError(
							"already-exists",
							"Terminal payment has already been finalized.",
						);
					}

					gratuityAmountCents = Math.max(
						0,
						Math.round(Number(terminalPaymentData.gratuityAmount || 0)),
					);
					totalPriceCents =
						subtotalCents +
						taxAmountCents +
						gratuityAmountCents +
						platformFeeCents;
					restaurantGrossAmountCents = totalPriceCents;

					if (Number(terminalPaymentData.amount || 0) !== totalPriceCents) {
						throw new functions.https.HttpsError(
							"failed-precondition",
							"Terminal payment amount does not match the selected closeout total.",
						);
					}

					const terminalItemIds = new Set(
						(Array.isArray(terminalPaymentData.itemIds)
							? terminalPaymentData.itemIds
							: [])
							.map((id) => String(id || "").trim())
							.filter(Boolean),
					);
					const selectedItemIdSetForTerminal = new Set(
						selectedCloseoutItemIds.map((id) => String(id || "").trim()),
					);
					const itemsMatch =
						terminalItemIds.size === selectedItemIdSetForTerminal.size &&
						[...selectedItemIdSetForTerminal].every((id) =>
							terminalItemIds.has(id),
						);
					if (!itemsMatch) {
						throw new functions.https.HttpsError(
							"failed-precondition",
							"Terminal payment does not match the selected closeout items.",
						);
					}

					processorFeeCents = Math.max(
						0,
						Math.round(
							Number(
								terminalPaymentData.stripeApplicationFeeAmount ||
									terminalPaymentData.applicationFeeAmount ||
									0,
							),
						),
					);
				}

				const restaurantTransferAmountCents = Math.max(
					0,
					totalPriceCents - processorFeeCents,
				);

				let turnaroundTimeMinutes = 0;
				try {
					if (partyData.createdAt && partyData.createdAt.toDate) {
						const openedAtMs = partyData.createdAt.toDate().getTime();
						turnaroundTimeMinutes = Math.max(
							0,
							Math.round((Date.now() - openedAtMs) / 60000),
						);
					}
				} catch (e) {
					console.warn(
						`closePartyTable: Could not compute turnaround time for ${partyId}:`,
						e,
					);
				}

				console.log("[closePartyTable totals]", {
					partyId,
					subtotalCents,
					originalSubtotalCents,
					discountTotalCents,
					taxAmountCents,
					gratuityAmountCents,
					platformFeeCents,
					processorFeeCents,
					cashReceivedCents,
					changeDueCents,
					totalPriceCents,
					itemCount: officiallyOrderedItems.length,
				});

				const closedBy = {
					userId: context.auth.uid,
					staffId: staffMember.id || closedByStaffId || null,
					name:
						closedByName ||
						staffMember.name ||
						context.auth.token.name ||
						null,
					role: staffMember.role || null,
					jobTitle: staffMember.jobTitle || null,
					email: context.auth.token.email || null,
				};
				const paymentId = db.collection("dummy").doc().id;

				const closeout = {
					id: paymentId,
					source: "restaurant_pos",
					orderEntryMode: "staff",
					feePolicy: "manual_tender_scerv_fee_waived",
					scope: closeoutScope,
					isFinalCloseout: isTableFullyPaid,
					itemIds: selectedCloseoutItemIds,
					seatIds: selectedCloseoutSeatIds,
					seats: selectedCloseoutSeats,
					paymentMethod: paymentMethod,
					tenderType: tenderType || paymentMethod,
					externalReference:
						paymentMethod === "stripe_terminal"
							? resolvedTerminalPaymentIntentId
							: String(externalReference || "").trim() || null,
					stripePaymentIntentId:
						paymentMethod === "stripe_terminal"
							? resolvedTerminalPaymentIntentId
							: null,
					receiptEmail: receiptEmail || null,
					closeoutNotes: String(closeoutNotes || "").trim() || null,
					subtotal: subtotalCents,
					originalSubtotal: originalSubtotalCents,
					discountTotal: discountTotalCents,
					taxAmount: taxAmountCents,
					taxRate: restaurantTaxRate,
					taxSource: "restaurant.taxRate",
					gratuityAmount: gratuityAmountCents,
					platformFee: platformFeeCents,
					processorFee: processorFeeCents,
					restaurantGrossAmount: restaurantGrossAmountCents,
					restaurantTransferAmount: restaurantTransferAmountCents,
					totalPrice: totalPriceCents,
					cashReceived: paymentMethod === "cash" ? cashReceivedCents : 0,
					changeDue: changeDueCents,
					paymentProcessor: manualPaymentProcessor,
					closedBy: closedBy,
					closedAtIso: new Date().toISOString(),
				};
				const existingCloseoutPayments = Array.isArray(
					partyData.closeoutPayments,
				)
					? partyData.closeoutPayments
					: [];
				const closeoutPayments = [...existingCloseoutPayments, closeout];
				const hasStripeTerminalPayment = closeoutPayments.some(
					(payment) => payment.paymentMethod === "stripe_terminal",
				);
				const closeoutFeePolicy = hasStripeTerminalPayment
					? "stripe_terminal_restaurant_processing_fee"
					: "manual_tender_scerv_fee_waived";
				const aggregateCloseout = closeoutPayments.reduce(
					(acc, payment) => {
						acc.subtotal += Number(payment.subtotal || 0);
						acc.originalSubtotal += Number(payment.originalSubtotal || 0);
						acc.discountTotal += Number(payment.discountTotal || 0);
						acc.taxAmount += Number(payment.taxAmount || 0);
						acc.gratuityAmount += Number(payment.gratuityAmount || 0);
						acc.platformFee += Number(payment.platformFee || 0);
						acc.processorFee += Number(payment.processorFee || 0);
						acc.restaurantGrossAmount += Number(
							payment.restaurantGrossAmount || 0,
						);
						acc.restaurantTransferAmount += Number(
							payment.restaurantTransferAmount || 0,
						);
						acc.totalPrice += Number(payment.totalPrice || 0);
						acc.cashReceived += Number(payment.cashReceived || 0);
						acc.changeDue += Number(payment.changeDue || 0);
						return acc;
					},
					{
						subtotal: 0,
						originalSubtotal: 0,
						discountTotal: 0,
						taxAmount: 0,
						gratuityAmount: 0,
						platformFee: 0,
						processorFee: 0,
						restaurantGrossAmount: 0,
						restaurantTransferAmount: 0,
						totalPrice: 0,
						cashReceived: 0,
						changeDue: 0,
					},
				);
				const balanceTotals = calculateRestaurantCloseoutTotals(
					remainingUnpaidItemsAfterPayment,
					restaurantTaxRate,
				);
				const balanceDueCents =
					balanceTotals.subtotalCents + balanceTotals.taxAmountCents;
				const updatedBasketItems = allItems.map((item) =>
					item && selectedCloseoutItemIdSet.has(item.id)
						? {
								...item,
								paymentStatus: "paid",
								closeoutStatus: "paid",
								paidAt: new Date().toISOString(),
								closeoutPaymentId: paymentId,
								paidByTenderType: tenderType || paymentMethod,
							}
						: item,
				);

				// ==========================================
				// 3. WRITES
				// ==========================================
				transaction.update(partyRef, {
					...(isTableFullyPaid
						? {
								status: "checkedOut",
								paymentStatus: "paid",
								customerStatus: "closed",
								serviceRequested: false,
								closedAt: admin.firestore.FieldValue.serverTimestamp(),
							}
						: {
								status: partyData.status || "active",
								paymentStatus: "partially_paid",
								customerStatus: "open",
							}),
					paymentMethod: paymentMethod,
					closeout: closeout,
					closeoutPayments,
					openBalance: {
						subtotal: balanceTotals.subtotalCents,
						taxAmount: balanceTotals.taxAmountCents,
						totalPrice: balanceDueCents,
						itemCount: remainingUnpaidItemsAfterPayment.length,
						updatedAtIso: new Date().toISOString(),
					},
					paidBalance: aggregateCloseout,
					lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
					closedByUserId: isTableFullyPaid ? context.auth.uid : null,
					closedByName: isTableFullyPaid ? closedBy.name : null,
				});

				if (basketDoc.exists) {
					transaction.set(
						basketRef,
						{
							items: updatedBasketItems,
							paymentStatus: isTableFullyPaid ? "paid" : "partially_paid",
							closeoutPayments,
							openBalance: {
								subtotal: balanceTotals.subtotalCents,
								taxAmount: balanceTotals.taxAmountCents,
								totalPrice: balanceDueCents,
								itemCount: remainingUnpaidItemsAfterPayment.length,
							},
							lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				}

				if (terminalPaymentRef) {
					transaction.set(
						terminalPaymentRef,
						{
							closeoutFinalized: true,
							closeoutFinalizedAt:
								admin.firestore.FieldValue.serverTimestamp(),
							closeoutPaymentId: paymentId,
							closeoutPartyId: partyId,
							updatedAt: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				}

				if (!isTableFullyPaid) {
					return {
						success: true,
						orderId: partyId,
						paymentId,
						isFinalCloseout: false,
						paymentStatus: "partially_paid",
						readableOrderId,
						subtotal: subtotalCents,
						taxAmount: taxAmountCents,
						taxRate: restaurantTaxRate,
						taxSource: "restaurant.taxRate",
						gratuityAmount: gratuityAmountCents,
						platformFee: platformFeeCents,
						processorFee: processorFeeCents,
						feePolicy: closeoutFeePolicy,
						restaurantTransferAmount: restaurantTransferAmountCents,
						cashReceived: paymentMethod === "cash" ? cashReceivedCents : 0,
						changeDue: changeDueCents,
						totalPrice: totalPriceCents,
						balanceDue: balanceDueCents,
						remainingItemCount: remainingUnpaidItemsAfterPayment.length,
					};
				}

				const usersToFree = [];

				if (partyData.hostUserId && partyData.hostUserId !== "walk_in_guest") {
					usersToFree.push(partyData.hostUserId);
				}

				if (Array.isArray(partyData.guestPips)) {
					partyData.guestPips.forEach((pip) => {
						if (
							pip &&
							pip.userId &&
							pip.userId !== "walk_in_guest" &&
							!usersToFree.includes(pip.userId)
						) {
							usersToFree.push(pip.userId);
						}
					});
				}

				[
					...(Array.isArray(partyData.guestUserIds)
						? partyData.guestUserIds
						: []),
					...(Array.isArray(partyData.memberUids) ? partyData.memberUids : []),
				].forEach((uid) => {
					if (
						uid &&
						uid !== "walk_in_guest" &&
						!usersToFree.includes(uid)
					) {
						usersToFree.push(uid);
					}
				});

				usersToFree.forEach((uid) => {
					const customerRef = db.collection("customers").doc(uid);

					transaction.set(
						customerRef,
						{
							activeCheckIn: null,
							activePartyId: null,
							activeRestaurantId: null,
							partyIds: admin.firestore.FieldValue.arrayRemove(partyId),
						},
						{ merge: true },
					);

					if (restaurantId) {
						const personalBasketRef = customerRef
							.collection("baskets")
							.doc(restaurantId);
						transaction.delete(personalBasketRef);
					}
				});

				if (partyData.checkInId) {
					const checkInRef = db.collection("checkIns").doc(partyData.checkInId);
					transaction.set(
						checkInRef,
						{
							status: "COMPLETED",
							paymentStatus: "paid",
							completedAt: admin.firestore.FieldValue.serverTimestamp(),
							completedBy: "restaurant_pos_closeout",
							archivedForAudit: true,
							closeoutId: partyId,
						},
						{ merge: true },
					);
				}

				if (basketDoc.exists) {
					transaction.set(
						basketRef,
						{
							status: "archived_paid",
							archivedForAudit: true,
							archivedAt: admin.firestore.FieldValue.serverTimestamp(),
							archivedOrderId: partyId,
							closeoutId: partyId,
							lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
						},
						{ merge: true },
					);
				}

				if (!kitchenOrdersSnap.empty) {
					kitchenOrdersSnap.forEach((docSnap) => {
						transaction.set(
							docSnap.ref,
							{
								overallStatus: "completed",
								status: "completed",
								closedAt: admin.firestore.FieldValue.serverTimestamp(),
								closedBy: "restaurant_pos_closeout",
								archivedForAudit: true,
								archivedOrderId: partyId,
								closeoutId: partyId,
							},
							{ merge: true },
						);
					});
				}

				transaction.set(orderRef, {
					id: partyId,
					partyId: partyId,
					readableOrderId,
					restaurantId: restaurantId,
					restaurantName: restaurantName,
					table: partyData.table || null,
					server: partyData.server || null,

					subtotal: aggregateCloseout.subtotal,
					originalSubtotal: aggregateCloseout.originalSubtotal,
					discountTotal: aggregateCloseout.discountTotal,
					taxAmount: aggregateCloseout.taxAmount,
					taxRate: restaurantTaxRate,
					taxSource: "restaurant.taxRate",
					gratuityAmount: aggregateCloseout.gratuityAmount,
					platformFee: aggregateCloseout.platformFee,
					processorFee: aggregateCloseout.processorFee,
					restaurantGrossAmount: aggregateCloseout.restaurantGrossAmount,
					restaurantTransferAmount:
						aggregateCloseout.restaurantTransferAmount,
					scervGrossFee:
						aggregateCloseout.platformFee + aggregateCloseout.processorFee,
					scervNet:
						aggregateCloseout.platformFee + aggregateCloseout.processorFee,
					stripeFeeResponsibility: hasStripeTerminalPayment
						? "restaurant"
						: "not_applicable",
					restaurantTransferStatus: hasStripeTerminalPayment
						? "stripe_terminal_processed"
						: "manual_tender",
					totalPrice: aggregateCloseout.totalPrice,
					cashReceived: aggregateCloseout.cashReceived,
					changeDue: aggregateCloseout.changeDue,

					openedAt:
						partyData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
					fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
					turnaroundTimeMinutes: turnaroundTimeMinutes,

					items: updatedBasketItems.filter(
						(item) => item && item.status && item.status !== "new",
					),
					closeoutPayments,
					isManualRestaurantOrder: true,
					orderEntryMode: "staff",
					feePolicy: closeoutFeePolicy,
					manualFeeEligible: hasStripeTerminalPayment,
					manualFeeReason: hasStripeTerminalPayment
						? null
						: "cash_or_external_terminal_not_processed_by_scerv",
					paymentProcessor: manualPaymentProcessor,
					paymentProcessorId:
						paymentMethod === "stripe_terminal"
							? resolvedTerminalPaymentIntentId
							: externalReference
								? String(externalReference || "").trim()
								: null,
					paymentMethod: paymentMethod,
					tenderType: tenderType || paymentMethod,
					externalReference:
						paymentMethod === "stripe_terminal"
							? resolvedTerminalPaymentIntentId
							: String(externalReference || "").trim() || null,
					receiptEmail: receiptEmail || null,
					closeoutNotes: String(closeoutNotes || "").trim() || null,
					closeoutSource: "restaurant_pos",
					closedByUserId: context.auth.uid,
					closedByName: closedBy.name,
					closedBy: closedBy,
					closeout: closeout,
					paymentTrace: {
						processor: manualPaymentProcessor,
						paymentMethod,
						tenderType: tenderType || paymentMethod,
						externalReference:
							paymentMethod === "stripe_terminal"
								? resolvedTerminalPaymentIntentId
								: String(externalReference || "").trim() || null,
						source: "restaurant_pos_closeout",
						feePolicy: closeoutFeePolicy,
						taxSource: "restaurant.taxRate",
						recordedAt: admin.firestore.FieldValue.serverTimestamp(),
					},
					paymentStatus: "paid",
					orderStatus: "confirmed",
					type: "party",
					orderMode: "dineIn",
					fulfillmentType: "table",
				});

				if (receiptEmail && officiallyOrderedItems.length > 0) {
					const itemsHtml = officiallyOrderedItems
						.map((item) => {
							const activePrice =
								item.discountedPrice !== undefined &&
								item.discountedPrice !== null
									? item.discountedPrice
									: item.price || 0;

							const quantity = parseInt(item.quantity || 1, 10);
							const lineTotal = parseFloat(activePrice || 0) * quantity;

							const selectedModifiers = Array.isArray(item.selectedModifiers)
								? item.selectedModifiers
								: [];

							const modifiersHtml = selectedModifiers.length
								? `
									<div style="margin-top: 4px; font-size: 12px; color: #666;">
										${selectedModifiers
											.map((modifier) => {
												const modifierName =
													typeof modifier.name === "string"
														? modifier.name
														: modifier.name && typeof modifier.name === "object"
															? modifier.name.en ||
																modifier.name.es ||
																modifier.name.original ||
																""
															: "";

												const modifierPrice = Number(modifier.price || 0);

												return `<div>• ${modifierName}${
													modifierPrice > 0
														? ` (+$${modifierPrice.toFixed(2)})`
														: ""
												}</div>`;
											})
											.join("")}
									</div>
								`
								: "";

							const instructionsText =
								item.specialInstructions &&
								typeof item.specialInstructions === "object"
									? item.specialInstructions.en ||
										item.specialInstructions.es ||
										item.specialInstructions.original ||
										""
									: item.specialInstructions || "";

							const instructionsHtml = instructionsText
								? `<div style="margin-top: 4px; font-size: 12px; color: #c0392b;">"${instructionsText}"</div>`
								: "";

							return `
								<tr>
									<td style="padding: 10px 0; border-bottom: 1px solid #eee; vertical-align: top;">
										<div>${quantity}x ${item.dishName || item.name}</div>
										${modifiersHtml}
										${instructionsHtml}
									</td>
									<td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; vertical-align: top;">
										$${lineTotal.toFixed(2)}
									</td>
								</tr>
							`;
						})
						.join("");

					const mailRef = db.collection("mail").doc();
					transaction.set(mailRef, {
						to: receiptEmail,
						message: {
							subject: `Your Receipt from ${restaurantName}`,
							html: `
								<div style="font-family: Helvetica, Arial, sans-serif; max-width: 450px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
									<h2 style="text-align: center; color: #1a1a1a; margin-bottom: 5px;">${restaurantName}</h2>
									<p style="text-align: center; color: #666; margin-top: 0; font-size: 14px;">
										Table: ${(partyData.table && partyData.table.name) || "Table"}
									</p>
									<p style="text-align: center; color: #666; margin-top: 0; font-size: 13px;">
										Order: ${readableOrderId}
									</p>

									<table style="width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 15px; color: #333;">
										${itemsHtml}
									</table>

									<div style="margin-top: 20px;">
										<div style="display: flex; justify-content: space-between; font-size: 14px; color: #333; margin-bottom: 6px;">
											<span>Subtotal</span>
											<span>$${(aggregateCloseout.subtotal / 100).toFixed(2)}</span>
										</div>
										<div style="display: flex; justify-content: space-between; font-size: 14px; color: #333; margin-bottom: 6px;">
											<span>Tax (${(restaurantTaxRate * 100).toFixed(2)}%)</span>
											<span>$${(aggregateCloseout.taxAmount / 100).toFixed(2)}</span>
										</div>
										<div style="display: flex; justify-content: space-between; font-size: 14px; color: #333; margin-bottom: 6px;">
											<span>Scerv Fee</span>
											<span>$0.00 waived</span>
										</div>
										${
											aggregateCloseout.gratuityAmount > 0
												? `<div style="display: flex; justify-content: space-between; font-size: 14px; color: #333; margin-bottom: 6px;">
											<span>Tip</span>
											<span>$${(aggregateCloseout.gratuityAmount / 100).toFixed(2)}</span>
										</div>`
												: ""
										}
										<h3 style="text-align: right; margin-top: 12px; color: #1a1a1a;">
											Total: $${(aggregateCloseout.totalPrice / 100).toFixed(2)}
										</h3>
									</div>
									<div style="margin-top: 18px; padding: 12px; border-radius: 8px; background: #f7f7f7; font-size: 13px; color: #555;">
										<div><strong>Tender:</strong> ${
											paymentMethod === "cash"
												? "Cash"
												: paymentMethod === "stripe_terminal"
													? "Stripe Terminal"
													: "External terminal"
										}</div>
										${
											paymentMethod === "cash"
												? `<div><strong>Cash received:</strong> $${(cashReceivedCents / 100).toFixed(2)}</div>
										<div><strong>Change due:</strong> $${(changeDueCents / 100).toFixed(2)}</div>`
												: `<div><strong>Reference:</strong> ${
														paymentMethod === "stripe_terminal"
															? resolvedTerminalPaymentIntentId
															: String(externalReference || "").trim()
													}</div>`
										}
										<div><strong>Tax source:</strong> restaurant.taxRate</div>
									</div>

									<div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea;">
										<p style="font-size: 12px; color: #999; margin: 0;">Thanks for dining with us!</p>
									</div>
								</div>
							`,
						},
					});
				}

				if (restaurantId && tableId) {
					const tableRef = db
						.collection("restaurants")
						.doc(restaurantId)
						.collection("tables")
						.doc(tableId);

					transaction.update(tableRef, { status: "checkedOut" });
				}

				return {
					success: true,
					orderId: partyId,
					paymentId,
					isFinalCloseout: true,
					readableOrderId,
					subtotal: subtotalCents,
					taxAmount: taxAmountCents,
					taxRate: restaurantTaxRate,
					taxSource: "restaurant.taxRate",
					gratuityAmount: gratuityAmountCents,
					platformFee: platformFeeCents,
					processorFee: processorFeeCents,
					feePolicy: closeoutFeePolicy,
					restaurantTransferAmount: restaurantTransferAmountCents,
					cashReceived: paymentMethod === "cash" ? cashReceivedCents : 0,
					changeDue: changeDueCents,
					totalPrice: totalPriceCents,
				};
			});
		} catch (error) {
			console.error(`Error closing party ${partyId}:`, error);
			if (error instanceof functions.https.HttpsError) throw error;
			throw new functions.https.HttpsError(
				"internal",
				"An error occurred while closing the table.",
			);
		}
	});
