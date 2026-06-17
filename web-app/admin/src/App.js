import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Dashboard from "./components/Dashboard";
import Header from "./components/Header";
import Restaurants from "./components/Restaurants";
import Customers from "./components/Customers";
import ProtectedRoute from "./components/ProtectedRoute";
import SignIn from "./components/SignIn";
import { auth } from "./config/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import Unauthorized from "./components/Unauthorized";
import HandleInvite from "./components/HandleInvite";
import RestaurantDetails from "./components/RestaurantDetails";
import RestaurantMenu from "./components/RestaurantMenu";
import AdminUsers from "./components/AdminUsers";
import CommandCenter from "./components/CommandCenter";
import CustomerDetail from "./components/CustomerDetail";
import OrderSupportDetail from "./components/OrderSupportDetail";
import CreateRestaurant from "./components/CreateRestaurant";
import AuditLogs from "./components/AuditLogs";
import SupportCases from "./components/SupportCases";
import Promotions from "./components/Promotions";
import DataExplorer from "./components/DataExplorer";
import DemoLeads from "./components/DemoLeads";

function App() {
	const [user] = useAuthState(auth);

	return (
		<div>
			<BrowserRouter>
				{user && <Header />}
				<Routes>
					<Route path="/signin" element={<SignIn />} />

					{/* Routes accessible to BOTH admin and godmode */}
					<Route
						path="/"
						element={
							<ProtectedRoute requiredRole="admin">
								<Dashboard />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/command-center"
						element={
							<ProtectedRoute requiredRole="admin">
								<CommandCenter />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/restaurants"
						element={
							<ProtectedRoute requiredRole="admin">
								<Restaurants />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/restaurants/new"
						element={
							<ProtectedRoute requiredRole="admin">
								<CreateRestaurant />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/restaurants/:id"
						element={
							<ProtectedRoute requiredRole="admin">
								<RestaurantDetails />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/restaurants/:id/menu"
						element={
							<ProtectedRoute requiredRole="admin">
								<RestaurantMenu />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/customers"
						element={
							<ProtectedRoute requiredRole="admin">
								<Customers />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/customers/:id"
						element={
							<ProtectedRoute requiredRole="admin">
								<CustomerDetail />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/orders/:id"
						element={
							<ProtectedRoute requiredRole="admin">
								<OrderSupportDetail />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/support-cases"
						element={
							<ProtectedRoute requiredRole="admin">
								<SupportCases />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/promotions"
						element={
							<ProtectedRoute requiredRole="admin">
								<Promotions />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/demo-leads"
						element={
							<ProtectedRoute requiredRole="admin">
								<DemoLeads />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/admin-users"
						element={
							<ProtectedRoute requiredRole="godmode">
								<AdminUsers />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/audit-logs"
						element={
							<ProtectedRoute requiredRole="godmode">
								<AuditLogs />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/data-explorer"
						element={
							<ProtectedRoute requiredRole="godmode">
								<DataExplorer />
							</ProtectedRoute>
						}
					/>

					<Route path="/handle-invite" element={<HandleInvite />} />
					<Route path="/unauthorized" element={<Unauthorized />} />
					<Route
						path="*"
						element={user ? <Navigate to="/" /> : <Navigate to="/signin" />}
					/>
				</Routes>
			</BrowserRouter>
		</div>
	);
}

export default App;

