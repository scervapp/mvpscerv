import React, { Suspense, useEffect } from "react"; // Added useEffect
import {
	BrowserRouter as Router,
	Route,
	Routes,
	Outlet,
} from "react-router-dom";
import styled, { ThemeProvider } from "styled-components";
import theme from "./styles/theme";
import GlobalStyle from "./styles/globalStyles";
import { HelmetProvider } from "react-helmet-async";
import ReactGA from "react-ga4"; // <-- Added GA4 import

// Main Components
import Header from "./components/Header";
import Footer from "./components/Footer";
import Hero from "./components/Hero";
import Solutions from "./components/Solutions";
import CallToAction from "./components/CallToAction";

// Pages
import RequestDemo from "./components/RequestDemo";
import Pricing from "./components/Pricing";
import ContactUs from "./components/ContactUs";

// Redirects & Utility
import { PaymentCancel, PaymentSuccess } from "./components/PayRedirects";
import ScanRedirect from "./components/ScanRedirect";
import AboutUs from "./components/AboutUs";
import RestaurantLanding from "./components/RestaurantLanding";
import { ResourceArticle, ResourceHub } from "./components/RestaurantResources";

// --- Styled Components ---
const AppContainer = styled.div`
	display: flex;
	flex-direction: column;
	min-height: 100vh;
`;

const MainContent = styled.main`
	flex-grow: 1;
	background-color: ${({ theme }) => theme.colors.background};
`;

const LoadingScreen = styled.div`
	height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	font-family: ${({ theme }) => theme.fonts.heading};
	color: ${({ theme }) => theme.colors.primary};
	font-size: 1.5rem;
	font-weight: 700;
	background-color: ${({ theme }) => theme.colors.background};
`;

const WebsiteLayout = () => {
	return (
		<AppContainer>
			<Header />
			<MainContent>
				<Outlet />
			</MainContent>
			<Footer />
		</AppContainer>
	);
};

const App = () => {
	// --- Initialize Google Analytics ---
	useEffect(() => {
		ReactGA.initialize("G-2CSDRNHNTH");
		// Send initial pageview
		ReactGA.send({
			hitType: "pageview",
			page: window.location.pathname + window.location.search,
		});
	}, []);

	return (
		<HelmetProvider>
			<ThemeProvider theme={theme}>
				<GlobalStyle />
				<Suspense fallback={<LoadingScreen>Loading Scerv...</LoadingScreen>}>
					<Router>
						<Routes>
							{/* 1. MAIN WEBSITE */}
							<Route element={<WebsiteLayout />}>
								<Route
									path="/"
									element={
										<>
											<Hero />
											<Solutions />
											<CallToAction />
										</>
									}
								/>
								<Route path="/request-demo" element={<RequestDemo />} />
								<Route path="/contact" element={<ContactUs />} />
								<Route path="/pricing" element={<Pricing />} />
								<Route path="/about" element={<AboutUs />} />
								<Route path="/resources" element={<ResourceHub />} />
								<Route
									path="/resources/:slug"
									element={<ResourceArticle />}
								/>
								<Route
									path="/restaurants/:slug"
									element={<RestaurantLanding />}
								/>
							</Route>

							{/* 2. APP REDIRECTS */}
							<Route path="/payment-success" element={<PaymentSuccess />} />
							<Route path="/payment-cancel" element={<PaymentCancel />} />
							<Route path="/scan" element={<ScanRedirect />} />
						</Routes>
					</Router>
				</Suspense>
			</ThemeProvider>
		</HelmetProvider>
	);
};

export default App;
