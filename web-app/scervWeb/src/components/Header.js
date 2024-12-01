import React from "react";

const Header = () => {
	return (
		<header className="header">
			<div className="container">
				{/* Use a container for layout */}
				<img src="../../scerv_logo.png" alt="Scerv Logo" className="logo" />
				{/* Replace with your logo path */}
				<nav>
					{/* Navigation links */}
					<ul>
						<li>
							<a href="#features">Features</a>
						</li>
						<li>
							<a href="#benefits">Benefits</a>
						</li>
						<li>
							<a href="#testimonials">Testimonials</a>
						</li>
						<li>
							<a href="#contact">Contact</a>
						</li>
					</ul>
				</nav>
			</div>
		</header>
	);
};

export default Header;
