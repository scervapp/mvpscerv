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
	await seed("restaurantPublic/rest-a", { name: "Harbor and Ember" });
	await seed("menuItems/item-a", {
		name: "Oysters",
		restaurantId: "rest-a",
		averageRating: 4.8,
	});

	await assertSucceeds(getDoc(doc(anon(), "restaurantPublic/rest-a")));
	await assertSucceeds(getDoc(doc(anon(), "menuItems/item-a")));
	await assertFails(getDoc(doc(anon(), "restaurants/rest-a")));
	await assertFails(
		setDoc(doc(anon(), "restaurantPublic/rest-b"), { name: "Forged" }),
	);
	await assertFails(
		setDoc(doc(anon(), "menuItems/item-b"), {
			name: "Forged",
			restaurantId: "rest-a",
		}),
	);
});

test("raw restaurant documents are limited to restaurant users and Scerv admins", async () => {
	await seed("restaurants/rest-a", {
		name: "Harbor and Ember",
		stripeAccountId: "acct_sensitive",
	});

	await assertFails(getDoc(doc(anon(), "restaurants/rest-a")));
	await assertFails(getDoc(doc(authed("guest-a"), "restaurants/rest-a")));
	await assertSucceeds(
		getDoc(
			doc(
				authed("owner-a", { role: "owner", restaurantId: "rest-a" }),
				"restaurants/rest-a",
			),
		),
	);
	await assertSucceeds(
		getDoc(doc(authed("admin-a", { role: "godmode" }), "restaurants/rest-a")),
	);
});

test("client version app config is public-readable and server-written only", async () => {
	await seed("appConfig/clientVersions", {
		enabled: true,
		minNativeVersion: "0.0.44",
		minNativeBuildIos: 34,
		minNativeBuildAndroid: 36,
	});

	await assertSucceeds(getDoc(doc(anon(), "appConfig/clientVersions")));
	await assertFails(
		setDoc(doc(anon(), "appConfig/clientVersions"), {
			enabled: false,
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "appConfig/clientVersions"), {
			minNativeVersion: "0.0.1",
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

test("customers cannot write sensitive identity or balance fields", async () => {
	await seed("customers/alice", {
		fullName: "Alice",
		email: "alice@example.com",
	});

	await assertSucceeds(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			fullName: "Alice M",
			phoneNumber: "+15551234567",
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			isPhoneVerified: true,
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			role: "admin",
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			stripeCustomerId_test: "cus_fake",
		}),
	);
	await assertFails(
		updateDoc(doc(authed("alice"), "customers/alice"), {
			scervAvailablePoints: 999999,
		}),
	);
	await assertFails(
		setDoc(doc(authed("carol"), "customers/carol"), {
			fullName: "Carol",
			role: "customer",
			isPhoneVerified: true,
		}),
	);
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

test("R2 employee, private, and recursive restaurant subdocument reads are locked down", async () => {
	await seed("restaurants/rest-a/employees/employee-a", {
		firstName: "Sam",
		role: "manager",
		pinHash: "server-only",
	});
	await seed("restaurants/rest-a/private/owner", {
		email: "owner@example.com",
	});
	await seed("restaurants/rest-a/reservationSettings/general", {
		enabled: true,
	});

	const owner = authed("rest-a", { role: "owner", restaurantId: "rest-a" });
	const manager = authed("manager-a", {
		role: "manager",
		restaurantId: "rest-a",
	});
	const server = authed("server-a", {
		role: "server",
		restaurantId: "rest-a",
	});

	await assertFails(getDoc(doc(owner, "restaurants/rest-a/employees/employee-a")));
	await assertFails(getDoc(doc(manager, "restaurants/rest-a/employees/employee-a")));
	await assertFails(getDoc(doc(server, "restaurants/rest-a/employees/employee-a")));
	await assertFails(getDoc(doc(owner, "restaurants/rest-a/private/owner")));
	await assertFails(getDoc(doc(manager, "restaurants/rest-a/private/owner")));
	await assertFails(
		getDoc(doc(owner, "restaurants/rest-a/reservationSettings/general")),
	);
	await assertFails(
		getDoc(doc(manager, "restaurants/rest-a/reservationSettings/general")),
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

test("customers can create only their own check-in requests and party links", async () => {
	await seed("parties/party-a", {
		restaurantId: "rest-a",
		hostUserId: "alice",
		guestUserIds: ["alice"],
		memberUids: ["alice"],
	});
	await seed("parties/party-b", {
		restaurantId: "rest-a",
		hostUserId: "bob",
		guestUserIds: ["bob"],
		memberUids: ["bob"],
	});

	await assertSucceeds(
		setDoc(doc(authed("alice"), "checkIns/checkin-a"), {
			restaurantId: "rest-a",
			customerId: "alice",
			status: "REQUESTED",
		}),
	);
	await assertSucceeds(
		setDoc(doc(authed("alice"), "checkIns/checkin-b"), {
			restaurantId: "rest-a",
			customerId: "alice",
			status: "REQUESTED",
			associatedPartyId: "party-a",
		}),
	);
	await assertFails(
		setDoc(doc(authed("alice"), "checkIns/checkin-c"), {
			restaurantId: "rest-a",
			customerId: "alice",
			status: "REQUESTED",
			associatedPartyId: "party-b",
		}),
	);
	await assertFails(
		setDoc(doc(authed("mallory"), "checkIns/checkin-d"), {
			restaurantId: "rest-a",
			customerId: "alice",
			status: "REQUESTED",
		}),
	);
});

test("R1 server-owned vault and payment collections deny all client access", async () => {
	await seed("staffSessions/session-a", {
		restaurantId: "rest-a",
		employeeId: "employee-a",
	});
	await seed("staffPinAttempts/rest-a_employee-a", {
		count: 1,
	});
	await seed("emailOtpChallenges/hash-a", {
		codeHash: "server-only",
	});
	await seed("pending_orders/order-a", {
		customerId: "alice",
		restaurantId: "rest-a",
	});
	await seed("terminal_payments/payment-a", {
		restaurantId: "rest-a",
	});

	const customer = authed("alice");
	const staff = authed("server-a", {
		role: "server",
		restaurantId: "rest-a",
	});

	await assertFails(getDoc(doc(customer, "staffSessions/session-a")));
	await assertFails(getDoc(doc(staff, "staffSessions/session-a")));
	await assertFails(getDoc(doc(customer, "staffPinAttempts/rest-a_employee-a")));
	await assertFails(getDoc(doc(staff, "staffPinAttempts/rest-a_employee-a")));
	await assertFails(getDoc(doc(customer, "emailOtpChallenges/hash-a")));
	await assertFails(getDoc(doc(staff, "emailOtpChallenges/hash-a")));
	await assertFails(getDoc(doc(customer, "pending_orders/order-a")));
	await assertFails(getDoc(doc(staff, "pending_orders/order-a")));
	await assertFails(getDoc(doc(customer, "terminal_payments/payment-a")));
	await assertFails(getDoc(doc(staff, "terminal_payments/payment-a")));

	await assertFails(
		setDoc(doc(customer, "pending_orders/order-b"), {
			customerId: "alice",
			restaurantId: "rest-a",
		}),
	);
	await assertFails(
		setDoc(doc(staff, "terminal_payments/payment-b"), {
			customerId: "alice",
			restaurantId: "rest-a",
		}),
	);
	await assertFails(
		updateDoc(doc(customer, "pending_orders/order-a"), {
			totalPrice: 1,
		}),
	);
});
