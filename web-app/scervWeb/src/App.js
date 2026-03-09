import React from "react";

import {
	BrowserRouter as Router,
	Route,
	Routes,
	Outlet,
} from "react-router-dom";
import { ThemeProvider } from "styled-components";
import "./App.css";
import Header from "./components/Header";
import theme from "./styles/theme";
import Hero from "./components/Hero";
import FeaturesRestaurants from "./components/FeaturesRestaurants.";
import GlobalStyle from "./styles/globalStyles";
import Footer from "./components/Footer";
import CallToAction from "./components/CallToAction";
import Testimonials from "./components/Testimonials";
import FeaturesCustomers from "./components/FeaturesCustomers";
import RequestDemo from "./components/RequestDemo";
import TermsOfService from "./components/TermsOfService";
import PrivacyPolicy from "./components/PrivacyPolicy";
import ContactUs from "./components/ContactUs";
import Pricing from "./components/Pricing";
import { PaymentCancel, PaymentSuccess } from "./components/PayRedirects";
import ScanRedirect from "./components/ScanRedirect";

const WebsiteLayout = () => {
	return (
		<div
			style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
		>
			<Header />
			<main style={{ flexGrow: 1 }}>
				<Outlet /> {/* This is where the specific page content will load */}
			</main>
			<Footer />
		</div>
	);
};

const App = () => {
	return (
		<ThemeProvider theme={theme}>
			<Router>
				<GlobalStyle />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						minHeight: "100vh",
					}}
				>
					<main style={{ flexGrow: 1 }}>
						<div>
							<Routes>
								{/* ========================================= */}
								{/* 2. MAIN WEBSITE (WITH HEADER & FOOTER)    */}
								{/* ========================================= */}
								<Route element={<WebsiteLayout />}>
									<Route
										path="/"
										element={
											<>
												<Hero />
												<FeaturesRestaurants />
												<CallToAction />
											</>
										}
									/>
									<Route path="/request-demo" element={<RequestDemo />} />
									<Route
										path="/terms-of-service"
										element={<TermsOfService />}
									/>
									<Route path="/privacy-policy" element={<PrivacyPolicy />} />
									<Route path="/contact" element={<ContactUs />} />
									<Route path="/pricing" element={<Pricing />} />
								</Route>

								{/* ========================================= */}
								{/* 3. APP REDIRECTS (NO HEADER, NO FOOTER)   */}
								{/* ========================================= */}
								<Route path="/payment-success" element={<PaymentSuccess />} />
								<Route path="/payment-cancel" element={<PaymentCancel />} />

								{/* 🚨 YOUR NEW QR REDIRECT ROUTE */}
								<Route path="/scan" element={<ScanRedirect />} />
							</Routes>
						</div>
					</main>
					<Footer />
				</div>
			</Router>
		</ThemeProvider>
	);
};

export default App;
