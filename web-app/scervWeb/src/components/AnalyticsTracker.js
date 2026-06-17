import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ReactGA from "react-ga4";

const GA_MEASUREMENT_ID =
	process.env.REACT_APP_GA_MEASUREMENT_ID || "G-2CSDRNHNTH";

let analyticsInitialized = false;

const AnalyticsTracker = () => {
	const location = useLocation();

	useEffect(() => {
		if (!GA_MEASUREMENT_ID) {
			return;
		}

		// Initialize GA once, then send a page_view every time the SPA route changes.
		if (!analyticsInitialized) {
			ReactGA.initialize(GA_MEASUREMENT_ID);
			analyticsInitialized = true;
		}

		const page = `${location.pathname}${location.search}`;

		ReactGA.send({
			hitType: "pageview",
			page,
			title: document.title,
		});
	}, [location.pathname, location.search]);

	return null;
};

export default AnalyticsTracker;
