// JSON Data for firestore

const sampleEmulatorData = {
	restaurants: {
		restaurant1: {
			restaurantName: "Luigi's Pizzeria",
			address: "123 Main Street",
			city: "New York",
			state: "NY",
			zipcode: "10001",
			cuisineType: "Italian",
			imageUri: "https://picsum.photos/300/200?random=1",
			hours: {
				Monday: { open: "1100", close: "2200" },
				Tuesday: { open: "1100", close: "2200" },
				Wednesday: { open: "1100", close: "2200" },
				Thursday: { open: "1100", close: "2200" },
				Friday: { open: "1100", close: "2300" },
				Saturday: { open: "1100", close: "2300" },
				Sunday: { open: "1200", close: "2100" },
			},
		},
		restaurant2: {
			restaurantName: "Sushi Delight",
			address: "456 Elm Avenue",
			city: "New York",
			state: "NY",
			zipcode: "10002",
			cuisineType: "Japanese",
			imageUri: "https://picsum.photos/300/200?random=2",
			hours: {
				Monday: { open: "1200", close: "2200" },
				Tuesday: { open: "1200", close: "2200" },
				Wednesday: { open: "1200", close: "2200" },
				Thursday: { open: "1200", close: "2200" },
				Friday: { open: "1200", close: "2300" },
				Saturday: { open: "1200", close: "2300" },
				Sunday: { open: "1200", close: "2100" },
			},
		},
	},
	customers: {
		user123: {
			firstName: "John",
			lastName: "Doe",
			email: "john.doe@example.com",
			pips: [
				{ id: "pip1", name: "John Doe" },
				{ id: "pip2", name: "Jane Smith" },
			],
		},
	},
	"restaurants/restaurant1/menuItems": {
		menuItem1: {
			name: "Pizza Margherita",
			description:
				"Classic Italian pizza with tomato sauce, mozzarella, and basil",
			price: 12.99,
			category: "Pizzas",
			imageUri: "https://picsum.photos/200/200?random=3",
		},
		menuItem2: {
			name: "Spaghetti Bolognese",
			description: "Hearty meat sauce with spaghetti",
			price: 10.99,
			category: "Pasta",
			imageUri: "https://picsum.photos/200/200?random=4",
		},
	},
	"restaurants/restaurant2/menuItems": {
		menuItem3: {
			name: "California Roll",
			description: "Crab, avocado, and cucumber roll",
			price: 8.5,
			category: "Rolls",
			imageUri: "https://picsum.photos/200/200?random=5",
		},
	},
	checkIns: {},
	"baskets/user123/basketItems": {
		basketItem1: {
			restaurantId: "restaurant1",
			dish: {
				id: "menuItem1",
				name: "Pizza Margherita",
				price: 12.99,
			},
			quantity: 1,
			specialInstructions: "",
			pip: { id: "pip1", name: "John Doe" },
		},
		basketItem2: {
			restaurantId: "restaurant1",
			dish: {
				id: "menuItem2",
				name: "Spaghetti Bolognese",
				price: 10.99,
			},
			quantity: 1,
			specialInstructions: "Extra parmesan",
			pip: { id: "pip2", name: "Jane Smith" },
		},
	},
};
module.exports = sampleEmulatorData;
