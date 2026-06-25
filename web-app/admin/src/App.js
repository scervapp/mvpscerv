import React from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	Navigate,
	useLocation,
} from "react-router-dom";
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
import NewsletterSubscribers from "./components/NewsletterSubscribers";
import { selectedAdminEnvironment } from "./config/firebase";

const ScrollToTop = () => {
	const location = useLocation();

	React.useEffect(() => {
		if ("scrollRestoration" in window.history) {
			window.history.scrollRestoration = "manual";
		}
	}, []);

	React.useEffect(() => {
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		window.scrollTo({ top: 0, left: 0, behavior: "auto" });

		const resetScroll = window.setTimeout(() => {
			document.documentElement.scrollTop = 0;
			document.body.scrollTop = 0;
			window.scrollTo({ top: 0, left: 0, behavior: "auto" });
		}, 50);

		return () => window.clearTimeout(resetScroll);
	}, [location.pathname]);

	return null;
};

class AdminRouteErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error) {
		return { error };
	}

	componentDidCatch(error, errorInfo) {
		console.error("Admin route render failed", error, errorInfo);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="route-state-card route-error-card">
					<p>Admin route failed to render.</p>
					<code>{this.state.error.message}</code>
				</div>
			);
		}

		return this.props.children;
	}
}

const RouteBoundary = ({ children }) => {
	const location = useLocation();

	// Reset the boundary on navigation so one route error does not blank every tab.
	return (
		<AdminRouteErrorBoundary key={location.pathname}>
			{children}
		</AdminRouteErrorBoundary>
	);
};

function App() {
	const [user] = useAuthState(auth);

	return (
		<div className={`admin-shell admin-shell-${selectedAdminEnvironment.tone}`}>
			<div className="environment-rail" aria-hidden="true" />
			<div className="environment-banner">
				<span className="environment-pill">
					{selectedAdminEnvironment.shortLabel}
				</span>
				<span>{selectedAdminEnvironment.label} workspace</span>
				<strong>{selectedAdminEnvironment.projectId}</strong>
			</div>
			<BrowserRouter>
				<ScrollToTop />
				{user && <Header />}
				<main className="admin-content">
					<RouteBoundary>
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
							path="/newsletter"
							element={
								<ProtectedRoute requiredRole="admin">
									<NewsletterSubscribers />
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
					</RouteBoundary>
				</main>
			</BrowserRouter>
		</div>
	);
}

export default App;

