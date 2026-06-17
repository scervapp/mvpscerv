import React from "react";
import { Link, useParams } from "react-router-dom";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";

const resources = [
	{
		slug: "restaurant-startup-checklist",
		category: "Startup",
		title: "Restaurant Startup Checklist: From Idea to Opening Night",
		description:
			"A practical checklist for turning a restaurant concept into an operation guests can trust from day one.",
		readTime: "8 min read",
		sections: [
			{
				heading: "Concept and positioning",
				items: [
					"Define the guest you are serving, the occasion you are built for, and the reason your restaurant deserves repeat visits.",
					"Write a simple one-page brand promise: cuisine, price range, service style, neighborhood fit, and signature items.",
					"Validate the menu against local competitors before signing a lease or buying equipment.",
				],
			},
			{
				heading: "Numbers before nostalgia",
				items: [
					"Model rent, labor, food cost, merchant fees, utilities, insurance, repairs, and marketing before you fall in love with a space.",
					"Know your required daily sales target, average check goal, and table turns needed to break even.",
					"Create a launch reserve so one slow month does not force desperate decisions.",
				],
			},
			{
				heading: "Operating foundation",
				items: [
					"Document opening, shift change, service recovery, cash handling, cleaning, and closing procedures.",
					"Build your menu in a way that supports training, kitchen speed, allergens, upsells, reviews, and online discovery.",
					"Choose systems that help you understand guests, not only collect payments.",
				],
			},
		],
		takeaway:
			"The best openings feel exciting to guests because the boring work was handled before the doors opened.",
	},
	{
		slug: "mistakes-new-restaurants-make",
		category: "Operations",
		title: "Mistakes New Restaurants Make in the First 90 Days",
		description:
			"Common early mistakes that quietly damage cash flow, reviews, team morale, and repeat business.",
		readTime: "7 min read",
		sections: [
			{
				heading: "Trying to be everything",
				items: [
					"Large menus slow the kitchen, confuse guests, increase waste, and make it harder to know what you are famous for.",
					"Start with a tighter menu and build around the dishes people remember, reorder, and recommend.",
				],
			},
			{
				heading: "Ignoring the guest after payment",
				items: [
					"The relationship should not end when the check closes. Capture feedback, understand favorites, and give guests reasons to return.",
					"Reviews and ratings should become operating intelligence, not vanity metrics.",
				],
			},
			{
				heading: "Training only for tasks",
				items: [
					"Staff need to know the menu story, allergy protocol, service standards, and recovery rules.",
					"Great systems make new staff productive faster, but the hospitality standard still has to be taught.",
				],
			},
		],
		takeaway:
			"Early restaurant success is less about doing more and more about removing friction from the guest and team experience.",
	},
	{
		slug: "restaurant-pos-comparison-guide",
		category: "Technology",
		title: "How to Compare Restaurant POS Systems Without Getting Lost",
		description:
			"A restaurant-first framework for comparing POS systems, ordering tools, KDS, loyalty, reporting, and guest data.",
		readTime: "9 min read",
		sections: [
			{
				heading: "Start with your service model",
				items: [
					"Quick service, full service, bars, cafes, hotels, and fine dining do not need the exact same stack.",
					"List the workflows you must support: tableside orders, bar routing, split checks, reservations, inventory, delivery, loyalty, and reporting.",
				],
			},
			{
				heading: "Compare total operating fit",
				items: [
					"Square describes restaurant POS around ordering, menus, inventory, payments, reporting, team management, and cloud access.",
					"Toast publicly positions its platform around service models, POS, order and pay, KDS, loyalty, CRM, marketing, payroll, inventory, and integrations.",
					"Lightspeed highlights inventory, delivery consolidation, KDS, tableside POS, integrations, offline operation, and multi-location management.",
				],
			},
			{
				heading: "Ask what happens after the transaction",
				items: [
					"Many systems are strong at payments and ticket flow. Fewer help restaurants turn guest behavior into repeat visits.",
					"Ask how easily you can identify top dishes, reward loyal guests, manage service issues, and create targeted reasons to return.",
				],
			},
		],
		sources: [
			{ label: "Toast restaurant POS", url: "https://pos.toasttab.com/" },
			{
				label: "Square restaurant POS",
				url: "https://squareup.com/us/en/point-of-sale/restaurants",
			},
			{
				label: "Lightspeed restaurant POS",
				url: "https://www.lightspeedhq.com/pos/restaurant/",
			},
		],
		takeaway:
			"Do not buy a POS only for today's checkout. Choose a stack that protects service now and helps you build guest demand over time.",
	},
	{
		slug: "drive-restaurant-traffic",
		category: "Growth",
		title: "How Restaurants Can Drive More Traffic Without Discounting Everything",
		description:
			"Traffic growth comes from better reasons to visit, better timing, and better memory, not constant blanket discounts.",
		readTime: "6 min read",
		sections: [
			{
				heading: "Make the menu discoverable",
				items: [
					"Guests often search by craving, not by restaurant name. Treat dishes like searchable products.",
					"Tag signature items with cuisine, dietary needs, flavor, meal period, and aliases guests actually use.",
				],
			},
			{
				heading: "Reward behavior that matters",
				items: [
					"Use first-visit offers carefully, then shift toward rewards that encourage a second and third visit.",
					"Measure whether promotions create repeat guests or only train people to wait for a discount.",
				],
			},
			{
				heading: "Turn feedback into content",
				items: [
					"High-rated dishes should become social posts, staff recommendations, menu callouts, and campaign hooks.",
					"Negative feedback should trigger recovery, training, and menu adjustment before it becomes reputation damage.",
				],
			},
		],
		takeaway:
			"The most durable traffic strategy is to make the restaurant easier to remember, easier to trust, and easier to revisit.",
	},
	{
		slug: "menu-metadata-guide",
		category: "Menu",
		title: "Menu Metadata: The Hidden Work Behind Better Food Discovery",
		description:
			"How restaurants can structure menu items so guests can find the best dishes by craving, rating, diet, and occasion.",
		readTime: "7 min read",
		sections: [
			{
				heading: "Think beyond item name",
				items: [
					"A guest might search for calamari, squid, crispy seafood, small plates, happy hour, gluten free, spicy, or shareable.",
					"Good metadata connects all of those paths back to the right item without making the customer work.",
				],
			},
			{
				heading: "The fields worth capturing",
				items: [
					"Start with category, subcategory, cuisine tags, dietary tags, allergens, flavor tags, meal period, ingredients, aliases, spice level, and signature flags.",
					"Pair metadata with dish-level ratings and reviews so discovery is based on what guests actually love.",
				],
			},
			{
				heading: "Protect trust",
				items: [
					"Do not delete and recreate poorly reviewed items to reset history. Archive, revise, and document improvements instead.",
					"Trust compounds when guests believe the ratings and reviews are honest.",
				],
			},
		],
		takeaway:
			"Menu metadata is not busywork. It is the foundation for search, recommendations, better guest choices, and smarter operations.",
	},
	{
		slug: "reservation-and-waitlist-playbook",
		category: "Guest Experience",
		title: "Reservation and Waitlist Playbook for Modern Restaurants",
		description:
			"How to manage reservations, host check-ins, no-shows, and walk-ins without losing the hospitality feel.",
		readTime: "6 min read",
		sections: [
			{
				heading: "Separate settings from service",
				items: [
					"Owners and managers should control reservation rules, hours, capacity, deposits, and policies.",
					"Hosts and servers need a clean operational view: who is coming, who is waiting, who needs a table, and what happens next.",
				],
			},
			{
				heading: "No-shows need policy, not panic",
				items: [
					"Track no-shows, late cancels, confirmations, and repeat reliability so future decisions are informed.",
					"Use deposits or stricter confirmation windows only when the dining room economics justify it.",
				],
			},
			{
				heading: "Walk-ins are still guests",
				items: [
					"Digital check-in should not feel like a DMV line. Keep messaging warm, accurate, and fast.",
					"Give hosts the tools to assign tables and servers without making guests repeat themselves.",
				],
			},
		],
		takeaway:
			"A great reservation system protects the restaurant's capacity while making guests feel expected, not processed.",
	},
];

const Page = styled.div`
	background: ${({ theme }) => theme.colors.background};
`;

const HeroBand = styled.section`
	background: linear-gradient(
		135deg,
		${({ theme }) => theme.colors.primaryDark},
		${({ theme }) => theme.colors.primary}
	);
	color: ${({ theme }) => theme.colors.white};
	padding: 84px ${({ theme }) => theme.spacing.md} 72px;
`;

const Container = styled.div`
	margin: 0 auto;
	max-width: ${({ theme }) => theme.breakpoints.xl};
`;

const Eyebrow = styled.p`
	font-weight: 700;
	letter-spacing: 0;
	margin: 0 0 10px;
	text-transform: uppercase;
`;

const Title = styled.h1`
	color: inherit;
	font-size: clamp(2.2rem, 5vw, 4rem);
	line-height: 1.08;
	margin: 0;
	max-width: 880px;
`;

const Subtitle = styled.p`
	font-size: 1.15rem;
	line-height: 1.7;
	margin: 18px 0 0;
	max-width: 760px;
`;

const ResourceGrid = styled.section`
	display: grid;
	gap: 18px;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	padding: 48px ${({ theme }) => theme.spacing.md};

	@media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		grid-template-columns: 1fr;
	}
`;

const Card = styled(Link)`
	background: ${({ theme }) => theme.colors.white};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.text};
	display: flex;
	flex-direction: column;
	min-height: 260px;
	padding: 24px;
	text-decoration: none;
	transition:
		transform 0.2s ease,
		box-shadow 0.2s ease;

	&:hover {
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
		transform: translateY(-3px);
	}
`;

const Pill = styled.span`
	align-self: flex-start;
	background: ${({ theme }) => theme.colors.accent};
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	font-size: 0.82rem;
	font-weight: 700;
	padding: 6px 10px;
`;

const CardTitle = styled.h2`
	font-size: 1.35rem;
	margin: 18px 0 10px;
`;

const CardText = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	line-height: 1.6;
	margin: 0;
`;

const ReadTime = styled.span`
	color: ${({ theme }) => theme.colors.secondary};
	font-weight: 700;
	margin-top: auto;
	padding-top: 20px;
`;

const EcosystemBand = styled.section`
	background: ${({ theme }) => theme.colors.white};
	border-top: 1px solid ${({ theme }) => theme.colors.gray};
	padding: 48px ${({ theme }) => theme.spacing.md};
`;

const EcosystemGrid = styled.div`
	display: grid;
	gap: 20px;
	grid-template-columns: 0.9fr 1.1fr;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const PrincipleList = styled.div`
	display: grid;
	gap: 12px;
`;

const Principle = styled.div`
	border-left: 4px solid ${({ theme }) => theme.colors.secondary};
	padding-left: 14px;

	strong {
		display: block;
		margin-bottom: 4px;
	}

	span {
		color: ${({ theme }) => theme.colors.textLight};
		line-height: 1.5;
	}
`;

const ArticleWrap = styled.article`
	background: ${({ theme }) => theme.colors.white};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	margin: -34px auto 48px;
	max-width: 920px;
	padding: 34px;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		border-left: 0;
		border-radius: 0;
		border-right: 0;
		padding: 24px ${({ theme }) => theme.spacing.md};
	}
`;

const Section = styled.section`
	margin-top: 30px;

	h2 {
		font-size: 1.45rem;
		margin-bottom: 12px;
	}

	li {
		color: ${({ theme }) => theme.colors.textLight};
		line-height: 1.65;
		margin-bottom: 10px;
	}
`;

const Takeaway = styled.div`
	background: ${({ theme }) => theme.colors.accent};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.primaryDark};
	font-weight: 700;
	line-height: 1.6;
	margin-top: 30px;
	padding: 20px;
`;

const SourceList = styled.div`
	border-top: 1px solid ${({ theme }) => theme.colors.gray};
	margin-top: 30px;
	padding-top: 20px;

	a {
		color: ${({ theme }) => theme.colors.primary};
		display: inline-block;
		font-weight: 700;
		margin: 0 14px 8px 0;
	}
`;

const Missing = styled.div`
	padding: 80px ${({ theme }) => theme.spacing.md};
	text-align: center;
`;

const ResourceHub = () => (
	<Page>
		<Helmet>
			<title>Restaurant Growth Resources | Scerv</title>
			<meta
				name="description"
				content="Restaurant startup checklists, operational guides, POS comparison frameworks, menu metadata advice, and guest engagement playbooks from Scerv."
			/>
		</Helmet>
		<HeroBand>
			<Container>
				<Eyebrow>Scerv Restaurant Resources</Eyebrow>
				<Title>Practical playbooks for restaurants that want better traffic, service, and repeat guests.</Title>
				<Subtitle>
					We share the operating lessons openly: cleaner launches, stronger menus,
					smarter systems, better guest recovery, and more durable engagement.
					The deeper Scerv engine stays private; the restaurant wins stay public.
				</Subtitle>
			</Container>
		</HeroBand>

		<Container>
			<ResourceGrid>
				{resources.map((resource) => (
					<Card key={resource.slug} to={`/resources/${resource.slug}`}>
						<Pill>{resource.category}</Pill>
						<CardTitle>{resource.title}</CardTitle>
						<CardText>{resource.description}</CardText>
						<ReadTime>{resource.readTime}</ReadTime>
					</Card>
				))}
			</ResourceGrid>
		</Container>

		<EcosystemBand>
			<Container>
				<EcosystemGrid>
					<div>
						<Eyebrow>Brand ecosystem</Eyebrow>
						<h2>Helpful first. Product second. Trust always.</h2>
						<CardText>
							Scerv should become the place restaurant operators visit when they
							want sharper thinking, better systems, and more guests. We can
							teach generously without explaining every product mechanism.
						</CardText>
					</div>
					<PrincipleList>
						<Principle>
							<strong>Do not reveal the secret sauce.</strong>
							<span>Talk about outcomes, workflows, and restaurant value. Keep algorithms, roadmap bets, and proprietary data strategy private.</span>
						</Principle>
						<Principle>
							<strong>Build operator credibility.</strong>
							<span>Publish checklists, comparison frameworks, and playbooks that help owners make better decisions even before they buy.</span>
						</Principle>
						<Principle>
							<strong>Create demand loops.</strong>
							<span>Use resources to attract restaurants, collect demo intent, support onboarding, and feed future campaigns.</span>
						</Principle>
					</PrincipleList>
				</EcosystemGrid>
			</Container>
		</EcosystemBand>
	</Page>
);

const ResourceArticle = () => {
	const { slug } = useParams();
	const resource = resources.find((item) => item.slug === slug);

	if (!resource) {
		return (
			<Missing>
				<h1>Resource not found</h1>
				<p>This playbook may have moved.</p>
				<Link to="/resources">Back to resources</Link>
			</Missing>
		);
	}

	return (
		<Page>
			<Helmet>
				<title>{resource.title} | Scerv</title>
				<meta name="description" content={resource.description} />
			</Helmet>
			<HeroBand>
				<Container>
					<Eyebrow>{resource.category}</Eyebrow>
					<Title>{resource.title}</Title>
					<Subtitle>{resource.description}</Subtitle>
				</Container>
			</HeroBand>
			<ArticleWrap>
				<Link to="/resources">Back to resources</Link>
				{resource.sections.map((section) => (
					<Section key={section.heading}>
						<h2>{section.heading}</h2>
						<ul>
							{section.items.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</Section>
				))}
				<Takeaway>{resource.takeaway}</Takeaway>
				{resource.sources && (
					<SourceList>
						<strong>References for operators:</strong>
						<div>
							{resource.sources.map((source) => (
								<a
									key={source.url}
									href={source.url}
									target="_blank"
									rel="noreferrer"
								>
									{source.label}
								</a>
							))}
						</div>
					</SourceList>
				)}
			</ArticleWrap>
		</Page>
	);
};

export { ResourceHub, ResourceArticle };
