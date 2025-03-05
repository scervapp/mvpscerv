import React from "react";
import styled from "styled-components";
import TestimonialCard from "./TestimonialCard"; // Import TestimonialCard
import testimonialImage1 from "../images/testimonial1.jpg"; //  placeholder images
import testimonialImage2 from "../images/testimonial2.jpg";
import testimonialImage3 from "../images/testimonial3.jpg";

const TestimonialsSection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;
const Container = styled.div`
	max-width: 1200px;
	margin: 0 auto;
	padding: 0 20px;
`;

const H2 = styled.h2`
	font-size: 2rem;
	margin-bottom: 1rem;
	text-align: center;
`;
const TestimonialsGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(
		auto-fit,
		minmax(300px, 1fr)
	); // Responsive grid
	gap: ${({ theme }) => theme.spacing.lg};

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		grid-template-columns: 1fr; /* Stack testimonials on small screens */
	}
`;

const Testimonials = () => {
	return (
		<TestimonialsSection>
			<Container>
				<H2>What Restaurants and Diners Are Saying</H2>
				<TestimonialsGrid>
					<TestimonialCard
						quote="Scerv has transformed our operations. We've seen a significant increase in efficiency and customer satisfaction."
						author="Jane Doe"
						title="Owner, The Cozy Bistro"
						imageSrc={testimonialImage1} // Use the imported image
					/>
					<TestimonialCard
						quote="Ordering through Scerv is so easy and convenient. I love being able to skip the line and pay from my phone."
						author="John Smith"
						title="Regular Customer"
						imageSrc={testimonialImage2}
					/>
					<TestimonialCard
						quote="The analytics dashboard gives us valuable insights into our sales and customer behavior. It's helped us make data-driven decisions."
						author="David Lee"
						title="Manager, The Spicy Spoon"
						imageSrc={testimonialImage3}
					/>
					{/* Add more TestimonialCards as needed */}
				</TestimonialsGrid>
			</Container>
		</TestimonialsSection>
	);
};

export default Testimonials;
