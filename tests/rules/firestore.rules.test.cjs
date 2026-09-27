const { before, beforeEach, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
	deleteDoc,
	doc,
	getDoc,
	setDoc,
	updateDoc,
} = require("firebase/firestore");

let testEnv;

const rules = fs.readFileSync(
	path.join(__dirname, "../../firestore.rules"),
	"utf8",
);

before(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: "scerv-rules-ci",
		firestore: {
			rules,
			host: "127.0.0.1",
			port: 8080,
		},
	});
});

beforeEach(async () => {
	await testEnv.clearFirestore();
});

after(async () => {
	await testEnv.cleanup();
});

function authed(uid, token = {}) {
	return testEnv.authenticatedContext(uid, token).firestore();
}

function anon() {
	return testEnv.unauthenticatedContext().firestore();
}

async function seed(pathValue, data) {
	await testEnv.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), pathValue), data);
	});
}

test("public discovery documents are readable but not client-writable", async () => {
	await seed("restaurants/rest-a", { name: "Harbor and Ember" });
	await seed("menuItems/item-a", {
		name: "Oysters",
		restaurantId: "rest-a",
		averageRating: 4.8,
	});

	await assertSucceeds(getDoc(doc(anon(), "restaurants/rest-a")));
	await assertSucceeds(getDoc(doc(anon(), "menuItems/item-a")));
	await assertFails(
		setDoc(doc(anon(), "restaurants/rest-b"), { name: "Forged" }),
	);
	await assertFails(
		setDoc(doc(anon(), "menuItems/item-b"), {
			name: "Forged",
			restaurantId: "rest-a",
		}),
	);
});

test("customers can read and maintain only their own profile", async () => {
	await seed("customers/alice", { fullName: "Alice" });
	await seed("customers/bob", { fullName: "Bob" });

	await assertSucceeds(getDoc(doc(authed("alice"), "customers/alice")));
	await assertSucceeds(
		setDoc(doc(authed("carol"), "customers/carol"), { fullName: "Carol" }),
	);
	await assertSucceeds(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			fullName: "Alice M",
		}),
	);
	await assertFails(getDoc(doc(authed("alice"), "customers/bob")));
	await assertFails(
		updateDoc(doc(authed("alice"), "customers/bob"), { fullName: "Mallory" }),
	);
	await assertFails(deleteDoc(doc(authed("alice"), "customers/alice")));
});

test("restaurant managers can manage tables but guests cannot", async () => {
	const manager = authed("manager-a", {
		role: "manager",
		restaurantId: "rest-a",
	});
	const guest = authed("guest-a");

	await assertSucceeds(
		setDoc(doc(manager, "restaurants/rest-a/tables/table-a"), {
			name: "Window 1",
		}),
	);
	await assertSucceeds(getDoc(doc(anon(), "restaurants/rest-a/tables/table-a")));
	await assertFails(
		setDoc(doc(guest, "restaurants/rest-a/tables/table-b"), {
			name: "Forged",
		}),
	);
	await assertFails(
		updateDoc(doc(guest, "restaurants/rest-a/tables/table-a"), {
			status: "available",
		}),
	);
});

test("server-owned operational collections reject client writes", async () => {
	const customer = authed("alice");
	const staff = authed("server-a", {
		role: "server",
		restaurantId: "rest-a",
	});

	await assertFails(
		setDoc(doc(customer, "parties/party-a"), { restaurantId: "rest-a" }),
	);
	await assertFails(
		setDoc(doc(staff, "kitchen_orders/order-a"), { restaurantId: "rest-a" }),
	);
	await assertFails(
		setDoc(doc(staff, "terminal_payments/payment-a"), {
			restaurantId: "rest-a",
		}),
	);
	await assertFails(
		setDoc(doc(customer, "orders/order-a"), {
			customerId: "alice",
			restaurantId: "rest-a",
		}),
	);
});

test("legacy pending orders remain owner-create only until the planned lockdown", async () => {
	await assertSucceeds(
		setDoc(doc(authed("alice"), "pending_orders/order-a"), {
			customerId: "alice",
			restaurantId: "rest-a",
		}),
	);
	await assertFails(
		setDoc(doc(authed("mallory"), "pending_orders/order-b"), {
			customerId: "alice",
			restaurantId: "rest-a",
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "pending_orders/order-a"), {
			totalPrice: 1,
		}),
	);
});
