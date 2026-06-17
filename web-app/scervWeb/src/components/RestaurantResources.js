import React from "react";
import { Link, useParams } from "react-router-dom";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";

const resources = [
	{
		slug: "restaurant-tech-checklist-new-restaurants",
		category: "Startup",
		title: "Restaurant Tech Checklist for New Restaurants",
		description:
			"A practical, operator-first technology checklist for opening a restaurant without creating chaos for guests, staff, or ownership.",
		readTime: "14 min read",
		updated: "June 17, 2026",
		audience: "Owners, operators, general managers, and opening teams",
		intro: [
			"Opening a restaurant is already hard. The technology stack should make the opening calmer, not add another layer of confusion. The challenge is that most restaurants do not buy technology in one clean decision. They buy a POS because they need to take payments, a reservation tool because the dining room needs structure, a payroll system because staff has to be paid, a marketing tool because seats need to be filled, and a loyalty tool later when they realize guests are not coming back often enough.",
			"That piecemeal approach can work for a while, but it often creates hidden friction. Staff re-enter information. Managers jump between dashboards. Guests receive disconnected experiences. Owners cannot tell which dishes, servers, time slots, promotions, or guest behaviors are actually moving the business forward.",
			"This checklist is designed to help new restaurants think like operators before they sign contracts. You do not need every tool on day one. You do need a clear plan for how the tools will work together, who owns each workflow, and how the restaurant will learn from guest behavior over time.",
		],
		callout:
			"Principle: choose technology around service flow first, then reporting, then growth. A system that looks impressive in a demo but slows down the dining room will become expensive quickly.",
		sections: [
			{
				heading: "1. Start with your service model, not the software demo",
				body: [
					"Before comparing vendors, write down how the restaurant is supposed to run on a busy night. A counter-service cafe, a high-volume bar, a fine dining room, a hotel restaurant, and a fast casual concept all need different technology priorities. The worst stack is the one built from generic feature lists instead of the reality of your service model.",
					"Map the full guest journey: discovery, reservation or walk-in, check-in, seating, ordering, modifications, kitchen routing, payment, review, loyalty, and return visit. Then map the staff journey beside it: host stand, server station, bar, kitchen, manager, owner, and back office. Technology should reduce handoffs, not create new ones.",
				],
				checklist: [
					"Define service type: quick service, fast casual, full service, fine dining, bar, cafe, hotel, or hybrid.",
					"List the highest-pressure moments: lunch rush, dinner turn, bar surge, private events, tourist traffic, late-night checkout, or weekend brunch.",
					"Decide which workflows must be live on opening day and which can wait until the team is stable.",
					"Assign an owner for each system: POS, reservations, menu, payments, staff, reporting, guest recovery, and promotions.",
				],
			},
			{
				heading: "2. POS and payments: the foundation, not the whole strategy",
				body: [
					"The POS matters because it touches money, staff training, order entry, taxes, tips, refunds, reporting, and closeout. But a POS by itself is not a full hospitality strategy. Many systems are strong at taking payments and moving tickets. Fewer help restaurants understand why guests came, what they loved, what they disliked, and what would bring them back.",
					"When comparing POS options, look beyond monthly price. Consider hardware cost, payment processing terms, contract length, support quality, offline mode, menu complexity, staff permissions, refund workflows, reporting clarity, integration options, and how hard it is to train new staff.",
				],
				checklist: [
					"Confirm card-present and card-not-present processing rates, monthly fees, hardware costs, and contract length.",
					"Test refunds, discounts, voids, tips, split checks, partial payments, taxes, and closeout before opening.",
					"Make sure manager permissions match your operating reality.",
					"Ask how the system handles offline service, outages, and end-of-day reconciliation.",
					"Confirm export access for orders, customers, items, taxes, fees, tips, and payouts.",
				],
			},
			{
				heading: "3. Menu management: build for discovery, not just order entry",
				body: [
					"Most restaurants treat menu setup as an administrative task: name, price, category, description, photo. That is not enough anymore. Guests search by craving, dietary need, occasion, and social proof. They do not always know your restaurant name. They know they want calamari, vegan tacos, a great burger, gluten-free brunch, spicy noodles, or something shareable before a show.",
					"That means menu items should be structured like discoverable products. Tags, aliases, ingredients, allergens, cuisine, meal period, spice level, prep style, and review data all matter. This is not busywork. It becomes the foundation for search, recommendations, staff suggestions, promotions, and menu decisions.",
				],
				checklist: [
					"Capture category, subcategory, cuisine tags, dietary tags, allergens, flavor tags, ingredients, and dish aliases.",
					"Use guest language, not only chef language. If people call it squid, tag squid even if the menu says calamari.",
					"Identify signature dishes, high-margin dishes, staff favorites, and items worth promoting.",
					"Do not delete poorly reviewed items to reset history. Archive, improve, and preserve trust.",
				],
			},
			{
				heading: "4. Reservations, waitlist, and host check-in",
				body: [
					"Reservations are not just a calendar. They are capacity management, guest expectation management, table pacing, server workload, and revenue protection. New restaurants often underestimate how much chaos comes from unclear reservation rules or a messy host stand.",
					"Separate owner settings from service operations. Owners and managers should control hours, party size rules, deposits, confirmation windows, cancellation policy, and capacity. Hosts need a clean view of who is coming, who is waiting, who has arrived, and what table or server should be assigned next.",
				],
				checklist: [
					"Define reservation windows, maximum party sizes, grace periods, cancellation policy, and no-show tracking.",
					"Decide whether walk-ins can send check-in requests before reaching the host.",
					"Train hosts on table assignment, server rotation, wait estimates, and recovery language.",
					"Track late cancels and no-shows, but keep policies fair and clear.",
				],
			},
			{
				heading: "5. Kitchen and bar routing",
				body: [
					"Kitchen technology should protect the guest experience during pressure. A ticket that reaches the wrong station, misses a modifier, or arrives out of sequence creates waste and frustration. Even a small restaurant should think carefully about routing before opening.",
					"Decide which items go to kitchen, bar, expo, dessert, or other prep stations. Make sure modifiers and allergy notes are obvious. Test real orders with real edge cases before friends-and-family night.",
				],
				checklist: [
					"Route food, drinks, desserts, and special prep items to the correct stations.",
					"Test modifiers, substitutions, allergies, holds, fires, cancellations, and item status changes.",
					"Keep printed ticket fallback procedures ready if screens fail.",
					"Train staff on who can change an order after it is sent.",
				],
			},
			{
				heading: "6. Guest engagement and repeat visits",
				body: [
					"A restaurant does not win only when a guest pays. It wins when the guest remembers the experience, tells someone else, and comes back. New restaurants often spend heavily to get first visits, then do very little to create second and third visits.",
					"Build a simple repeat-guest strategy before opening. It can start with dish-level ratings, review capture, first-visit offers, birthday or anniversary moments, loyalty milestones, and targeted food credits. The key is to avoid blanket discounts that train guests to wait for deals. Reward behavior that creates long-term value.",
				],
				checklist: [
					"Capture ratings and reviews at the dish level, not only the restaurant level.",
					"Create a recovery process for bad experiences before they become public reputation damage.",
					"Define first-visit, second-visit, loyalty, and win-back campaigns.",
					"Track promotion redemption so you can reconcile cost and understand whether the offer created repeat behavior.",
				],
			},
			{
				heading: "7. Reporting: the numbers owners actually need",
				body: [
					"Many dashboards look impressive and still fail operators. A useful restaurant report should answer plain questions: What sold? When did we make money? What did we discount? What did we pay in fees? Which dishes drive reviews? Which service periods are weak? What should change next week?",
					"Start with the essentials. Daily sales, net sales, gross sales, discounts, refunds, tax, tips, service fees, payment method, order source, item mix, labor, average check, table turns, and payout reconciliation should be understandable without a finance degree.",
				],
				checklist: [
					"Separate gross sales, discounts, refunds, net sales, tax, gratuity, service fees, processing fees, and payouts.",
					"Review item performance by revenue, margin, rating, review volume, and reorder behavior.",
					"Track guest acquisition and repeat visits, not only transaction totals.",
					"Schedule a weekly owner review before the restaurant opens.",
				],
			},
			{
				heading: "8. Opening-day technology rehearsal",
				body: [
					"Do not let opening night be the first real test. Run rehearsals with fake guests, real menu items, real modifiers, real payments, real refunds, and real staff roles. Break the system on purpose while the room is calm.",
					"Create a checklist for the hour before service: devices charged, printers loaded, screens working, Wi-Fi tested, offline fallback understood, staff logged in, menu active, reservation settings confirmed, and support contacts available.",
				],
				checklist: [
					"Run at least one full mock service from reservation to payment.",
					"Test refunds, failed payments, duplicate orders, wrong table, item comp, and guest complaint workflows.",
					"Create a one-page emergency sheet for staff.",
					"Review what happened after the rehearsal and fix the workflow, not only the symptom.",
				],
			},
		],
		example:
			"If a 70-seat restaurant averages a $38 check and needs two strong turns to hit its dinner target, a checkout delay of only 8 minutes per table can quietly reduce capacity. Technology should help protect those turns without making guests feel rushed.",
		faqs: [
			{
				question: "What technology does a new restaurant need first?",
				answer:
					"Start with payments/POS, menu management, tax and tip handling, basic reporting, staff permissions, and a reservation or waitlist process if you take seated guests. Add loyalty, marketing, advanced analytics, and automation once the core service flow is stable.",
			},
			{
				question: "Should a new restaurant buy every system before opening?",
				answer:
					"No. Buying everything too early can create cost and training drag. What matters is choosing a stack that can grow without trapping the restaurant in disconnected workflows.",
			},
			{
				question: "How should restaurants compare POS systems?",
				answer:
					"Compare operating fit, payment terms, support, hardware, menu flexibility, reporting, integrations, staff training, refund workflows, and how well the system supports guest retention after the transaction.",
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
			"Restaurant technology should not be a pile of tools. It should be an operating system for smoother service, clearer decisions, and stronger repeat guest behavior.",
	},
	{
		slug: "mistakes-new-restaurants-make-before-opening",
		category: "Operations",
		title: "7 Mistakes New Restaurants Make Before Opening",
		description:
			"The most expensive restaurant mistakes often happen before the first guest sits down. Here is how to avoid them.",
		readTime: "13 min read",
		updated: "June 17, 2026",
		audience: "Restaurant founders, first-time owners, operators, and investors",
		intro: [
			"Restaurants rarely fail because of one dramatic mistake. More often, they struggle because of small decisions made before opening: a menu that is too large, a lease that needs impossible sales, staff trained too late, systems chosen without testing, or marketing that brings first-time guests without a plan to bring them back.",
			"Before opening, optimism is useful. But unchecked optimism is expensive. Owners are juggling construction, permits, hiring, vendors, menu costing, branding, social media, equipment, payroll, inspections, and family pressure. It is easy to confuse motion with readiness.",
			"This guide focuses on seven pre-opening mistakes that hurt restaurants early. None of them are glamorous. That is the point. The boring parts of restaurant preparation are what make the public experience feel effortless.",
		],
		callout:
			"Principle: a restaurant opening is not a finish line. It is the beginning of a feedback loop. Build the operation so it can learn quickly.",
		sections: [
			{
				heading: "Mistake 1: Signing a lease before understanding the sales target",
				body: [
					"A beautiful space can become a trap if the restaurant cannot realistically produce the sales required to support it. Rent is not just a monthly number. It determines how much pressure the restaurant must absorb every day before the owner makes a dollar.",
					"Before signing, model the business in plain terms. How many seats? How many turns? What average check? What labor percentage? What food cost? What slow days? What seasonality? What happens if opening month sales are 30 percent below the dream version?",
				],
				checklist: [
					"Calculate required daily sales to cover rent, labor, food cost, utilities, insurance, marketing, fees, repairs, debt, and owner compensation.",
					"Model conservative, expected, and strong sales scenarios.",
					"Visit the location at lunch, dinner, weekday, weekend, rain, traffic, and event times.",
					"Understand parking, visibility, delivery access, foot traffic, and nearby competition.",
				],
			},
			{
				heading: "Mistake 2: Building a menu that is too big to execute well",
				body: [
					"Large menus feel safe because they seem to offer something for everyone. In reality, they often increase prep time, inventory waste, training complexity, ticket times, and inconsistency. A menu that is hard for the kitchen to execute becomes hard for guests to trust.",
					"New restaurants should aim for a menu that is focused enough to become known for something. The goal is not to have fewer ideas forever. The goal is to open with a menu the team can execute during pressure.",
				],
				checklist: [
					"Identify the dishes that define the concept and remove items that do not support the story.",
					"Cost every dish and know which items are profit drivers, traffic drivers, and brand drivers.",
					"Limit overlapping ingredients that create waste without adding guest value.",
					"Create item metadata from day one: tags, allergens, dietary needs, prep style, aliases, and signature status.",
				],
			},
			{
				heading: "Mistake 3: Waiting too long to train staff",
				body: [
					"Training cannot be squeezed into the final two days before opening. Staff need to understand service standards, menu language, allergy protocols, table flow, payment flow, complaint recovery, and what the restaurant wants to be known for.",
					"New restaurants often train tasks but forget judgment. A server can learn where buttons are and still not know how to recover a cold entree, explain a signature dish, pace a table, or handle a guest who is confused by a digital process.",
				],
				checklist: [
					"Create role-specific training for hosts, servers, bartenders, runners, kitchen, managers, and owners.",
					"Run mock service with real scenarios: late reservation, allergy request, wrong item, refund, split check, upset guest, and kitchen delay.",
					"Teach staff the why behind the concept, not only the steps.",
					"Give managers clear authority for comps, discounts, refunds, and guest recovery.",
				],
			},
			{
				heading: "Mistake 4: Treating technology as an afterthought",
				body: [
					"Technology decisions made in a rush tend to punish the restaurant later. The POS might not handle the service model. The reservation system might not match seating rules. The menu might be hard to update. Reports might be unclear. Staff might need three logins to solve one guest problem.",
					"The goal is not to buy the most complex stack. The goal is to choose systems that match the actual workflow and help the restaurant learn from service.",
				],
				checklist: [
					"Test a full order from reservation or check-in through kitchen routing, payment, review, and reporting.",
					"Confirm who can edit menus, issue refunds, apply discounts, close tables, manage reservations, and view reports.",
					"Make sure owner dashboards separate gross sales, discounts, refunds, taxes, tips, fees, and payout reality.",
					"Choose systems that support repeat visits and guest understanding, not only transactions.",
				],
			},
			{
				heading: "Mistake 5: Marketing for opening week but not month two",
				body: [
					"Opening buzz can hide weak retention. Friends, family, influencers, and curious locals may fill the room at first. The real test is whether guests come back after the novelty fades.",
					"Before opening, define the second-visit strategy. What happens after someone has a great meal? How do you capture feedback? How do you identify the dishes people love? How do you invite them back without training them to wait for discounts?",
				],
				checklist: [
					"Create a launch content calendar that extends at least 60 days beyond opening night.",
					"Build campaigns around signature dishes, chef stories, neighborhood occasions, and guest favorites.",
					"Capture dish-level ratings and reviews so marketing can promote what guests actually love.",
					"Use first-time offers carefully and track whether they create repeat guests.",
				],
			},
			{
				heading: "Mistake 6: Not defining service recovery before something goes wrong",
				body: [
					"Something will go wrong. A dish will be late. A guest will dislike an item. A payment will fail. A reservation will be mishandled. The question is whether the team knows what to do before the room gets emotional.",
					"Great recovery feels fast, calm, and human. Poor recovery feels like staff asking permission while the guest gets more frustrated. Owners should decide recovery rules before opening.",
				],
				checklist: [
					"Define what servers, managers, and owners can comp or discount without escalation.",
					"Create scripts for late tables, wrong items, allergy concerns, refunds, and long wait times.",
					"Track issues so patterns become training opportunities.",
					"Follow up when a high-value guest or serious complaint needs personal attention.",
				],
			},
			{
				heading: "Mistake 7: Measuring the wrong things after soft opening",
				body: [
					"Soft openings should produce learning, not just photos. Too many restaurants ask, 'Did people like it?' That is too vague. Operators need to know where service slowed down, which dishes confused people, what guests wanted but could not find, which items were reordered, and where staff felt friction.",
					"The best operators turn early feedback into rapid improvement. They do not defend every idea. They listen, adjust, and protect the core concept.",
				],
				checklist: [
					"Review ticket times, order errors, voids, refunds, discounts, table turn times, and guest feedback after every rehearsal.",
					"Ask staff where the workflow breaks, not only whether they feel ready.",
					"Track item ratings and reviews from the beginning.",
					"Make one focused improvement after each test service instead of changing everything at once.",
				],
			},
		],
		example:
			"Example: if a new restaurant opens with 85 menu items and each item needs only one extra minute of explanation, training, prep discussion, or guest confusion, the team loses hours of attention every week. A tighter menu can improve speed, confidence, reviews, and food cost at the same time.",
		faqs: [
			{
				question: "What is the biggest mistake new restaurants make?",
				answer:
					"The biggest mistake is opening before the operating model is ready. A restaurant can survive imperfect decor, but it struggles when menu execution, staffing, service recovery, payments, reservations, and reporting are unclear.",
			},
			{
				question: "How many menu items should a new restaurant open with?",
				answer:
					"There is no universal number, but the opening menu should be small enough for the kitchen to execute consistently under pressure and clear enough for guests to understand what the restaurant is known for.",
			},
			{
				question: "Should new restaurants discount heavily to attract guests?",
				answer:
					"Heavy discounting can fill seats temporarily, but it can also weaken positioning. Better launch offers should encourage trial, collect feedback, and create a second visit without making the restaurant feel cheap.",
			},
		],
		takeaway:
			"Most pre-opening mistakes are preventable. The strongest restaurants open with clear numbers, focused menus, trained teams, tested systems, and a plan to turn first visits into repeat guests.",
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
	max-width: 920px;
`;

const Subtitle = styled.p`
	font-size: 1.15rem;
	line-height: 1.7;
	margin: 18px 0 0;
	max-width: 780px;
`;

const ResourceGrid = styled.section`
	display: grid;
	gap: 18px;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	padding: 48px ${({ theme }) => theme.spacing.md};

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
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
	min-height: 300px;
	padding: 28px;
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
	font-size: 1.55rem;
	margin: 18px 0 10px;
`;

const CardText = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	line-height: 1.65;
	margin: 0;
`;

const ReadTime = styled.span`
	color: ${({ theme }) => theme.colors.secondary};
	font-weight: 700;
	margin-top: auto;
	padding-top: 20px;
`;

const ArticleWrap = styled.article`
	background: ${({ theme }) => theme.colors.white};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	margin: -34px auto 48px;
	max-width: 960px;
	padding: 34px;

	@media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
		border-left: 0;
		border-radius: 0;
		border-right: 0;
		padding: 24px ${({ theme }) => theme.spacing.md};
	}
`;

const ArticleMeta = styled.div`
	color: ${({ theme }) => theme.colors.textLight};
	display: flex;
	flex-wrap: wrap;
	font-size: 0.94rem;
	gap: 10px 18px;
	margin: 18px 0 28px;
`;

const Intro = styled.div`
	p {
		color: ${({ theme }) => theme.colors.textLight};
		font-size: 1.06rem;
		line-height: 1.75;
	}
`;

const Callout = styled.div`
	background: ${({ theme }) => theme.colors.accent};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.primaryDark};
	font-weight: 700;
	line-height: 1.6;
	margin: 26px 0;
	padding: 20px;
`;

const Section = styled.section`
	border-top: 1px solid ${({ theme }) => theme.colors.gray};
	margin-top: 34px;
	padding-top: 30px;

	h2 {
		font-size: 1.45rem;
		margin-bottom: 12px;
	}

	p,
	li {
		color: ${({ theme }) => theme.colors.textLight};
		line-height: 1.7;
	}

	li {
		margin-bottom: 10px;
	}
`;

const Checklist = styled.div`
	background: #fbfbfb;
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	margin-top: 18px;
	padding: 18px;

	strong {
		display: block;
		margin-bottom: 10px;
	}

	ul {
		margin-bottom: 0;
	}
`;

const Example = styled.div`
	border-left: 4px solid ${({ theme }) => theme.colors.secondary};
	color: ${({ theme }) => theme.colors.textLight};
	font-weight: 700;
	line-height: 1.65;
	margin-top: 30px;
	padding-left: 18px;
`;

const Takeaway = styled.div`
	background: ${({ theme }) => theme.colors.primaryDark};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.white};
	font-weight: 700;
	line-height: 1.6;
	margin-top: 30px;
	padding: 22px;
`;

const Faq = styled.section`
	border-top: 1px solid ${({ theme }) => theme.colors.gray};
	margin-top: 34px;
	padding-top: 30px;

	h2 {
		margin-bottom: 18px;
	}

	div {
		margin-bottom: 18px;
	}

	h3 {
		font-size: 1.08rem;
		margin-bottom: 6px;
	}

	p {
		color: ${({ theme }) => theme.colors.textLight};
		line-height: 1.65;
		margin: 0;
	}
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

const CtaBox = styled.div`
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: ${({ theme }) => theme.radius.md};
	margin-top: 34px;
	padding: 24px;

	h2 {
		margin-top: 0;
	}

	p {
		color: ${({ theme }) => theme.colors.textLight};
		line-height: 1.65;
	}

	a {
		background: ${({ theme }) => theme.colors.secondary};
		border-radius: ${({ theme }) => theme.radius.md};
		color: ${({ theme }) => theme.colors.white};
		display: inline-block;
		font-weight: 700;
		padding: 10px 16px;
		text-decoration: none;
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
				content="Flagship restaurant startup and operations guides from Scerv for owners preparing to open, modernize, and grow."
			/>
		</Helmet>
		<HeroBand>
			<Container>
				<Eyebrow>Scerv Restaurant Resources</Eyebrow>
				<Title>Restaurant guides for smarter openings, stronger operations, and better guest experiences.</Title>
				<Subtitle>
					Explore practical resources for restaurant owners and operators
					building modern hospitality businesses. New guides will be added as
					the Scerv resource library grows.
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
				<ArticleMeta>
					<span>{resource.updated}</span>
					<span>{resource.readTime}</span>
					<span>{resource.audience}</span>
				</ArticleMeta>
				<Intro>
					{resource.intro.map((paragraph) => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</Intro>
				<Callout>{resource.callout}</Callout>
				{resource.sections.map((section) => (
					<Section key={section.heading}>
						<h2>{section.heading}</h2>
						{section.body.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
						<Checklist>
							<strong>Operator checklist</strong>
							<ul>
								{section.checklist.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</Checklist>
					</Section>
				))}
				<Example>{resource.example}</Example>
				<Takeaway>{resource.takeaway}</Takeaway>
				<Faq>
					<h2>FAQ</h2>
					{resource.faqs.map((faq) => (
						<div key={faq.question}>
							<h3>{faq.question}</h3>
							<p>{faq.answer}</p>
						</div>
					))}
				</Faq>
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
				<CtaBox>
					<h2>Building a restaurant stack?</h2>
					<p>
						Scerv helps restaurants think beyond transactions toward smoother
						service, stronger guest engagement, and better operating clarity.
					</p>
					<Link to="/request-demo">Request a demo</Link>
				</CtaBox>
			</ArticleWrap>
		</Page>
	);
};

export { ResourceHub, ResourceArticle };
