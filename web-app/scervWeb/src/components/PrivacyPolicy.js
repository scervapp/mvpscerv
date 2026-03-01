import React from "react";
import styled from "styled-components";

const PrivacyPolicySection = styled.section`
	padding: ${({ theme }) => theme.spacing.xl} 0;
	background-color: ${({ theme }) => theme.colors.background};
`;

const Container = styled.div`
	max-width: ${({ theme }) => theme.breakpoints.lg};
	margin: 0 auto;
	padding: 0 ${({ theme }) => theme.spacing.md};
	background-color: ${({ theme }) => theme.colors.white};
	border-radius: ${({ theme }) => theme.radius.md};
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	padding: ${({ theme }) => theme.spacing.lg};
`;

const H1 = styled.h1`
	font-size: 2.5rem;
	margin-bottom: ${({ theme }) => theme.spacing.md};
	text-align: center;
`;

const H2 = styled.h2`
	font-size: 1.8rem;
	margin-top: ${({ theme }) => theme.spacing.lg};
	margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const P = styled.p`
	font-size: 1rem;
	line-height: 1.6;
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const List = styled.ul`
	list-style: disc;
	margin-left: ${({ theme }) => theme.spacing.lg};
	margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ListItem = styled.li`
	margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Bold = styled.b`
	font-weight: bold;
`;

const PrivacyPolicy = () => {
	return (
		<PrivacyPolicySection>
			<Container>
				<H1>Scerv Privacy Policy</H1>

				<P>Last Updated: Jan. 2025</P>

				<P>
					This Privacy Policy describes how Scerv ("we," "us," or "our")
					collects, uses, and shares personal information of users of our
					website, mobile application, and related services (collectively, the
					"Service"). By accessing or using the Service, you agree to the
					collection, use, and sharing of your personal information as described
					in this Privacy Policy. If you do not agree with our policies and
					practices, do not use the Service.
				</P>

				<H2>1. Information We Collect</H2>
				<P>We collect the following types of information:</P>
				<List>
					<ListItem>
						<Bold>Information You Provide Directly to Us:</Bold> This includes
						information you provide when you create an account, request a demo,
						contact us, or otherwise use the Service. This may include your
						name, restaurant name, email address, phone number, and any other
						information you choose to provide.
					</ListItem>
					<ListItem>
						<Bold>Information We Collect Automatically:</Bold> When you use the
						Service, we automatically collect certain information, including:
						<List>
							<ListItem>
								Device information (e.g., device type, operating system, unique
								device identifiers).
							</ListItem>
							<ListItem>
								Usage data (e.g., pages visited, features used, time spent on
								the Service).
							</ListItem>
							<ListItem>
								Location data (if you enable location services).
							</ListItem>
							<ListItem>IP address.</ListItem>
							<ListItem>
								Cookies and similar technologies (see Section 3 below).
							</ListItem>
						</List>
					</ListItem>
					<ListItem>
						<Bold>Information from Third Parties:</Bold> We may receive
						information about you from third parties, such as payment processors
						or analytics providers. [Be specific about which third parties and
						what data].
					</ListItem>
				</List>

				<H2>2. How We Use Your Information</H2>
				<P>We use your information for the following purposes:</P>
				<List>
					<ListItem>To provide and maintain the Service.</ListItem>
					<ListItem>To process your requests and transactions.</ListItem>
					<ListItem>
						To communicate with you, including sending you service-related
						notices and promotional messages (you can opt out of promotional
						messages).
					</ListItem>
					<ListItem>To personalize your experience on the Service.</ListItem>
					<ListItem>To improve the Service and develop new features.</ListItem>
					<ListItem>
						To analyze usage trends and gather demographic information.
					</ListItem>
					<ListItem>
						To detect, prevent, and address technical issues and security
						vulnerabilities.
					</ListItem>
					<ListItem>To comply with legal obligations.</ListItem>
					<ListItem>To enforce our Terms of Service.</ListItem>
				</List>

				<H2>3. Cookies and Similar Technologies</H2>
				<P>
					We use cookies and similar technologies (e.g., web beacons, pixels) to
					collect information about your use of the Service. Cookies are small
					data files that are stored on your device. We use cookies for the
					following purposes:
				</P>
				<List>
					<ListItem>To remember your preferences.</ListItem>
					<ListItem>To understand how you use the Service.</ListItem>
					<ListItem>To personalize your experience.</ListItem>
					<ListItem>
						To track the effectiveness of our marketing campaigns.
					</ListItem>
				</List>
				<P>
					You can control cookies through your browser settings. However,
					disabling cookies may limit your ability to use certain features of
					the Service.
				</P>

				<H2>4. Sharing of Your Information</H2>
				<P>We may share your information with the following third parties:</P>
				<List>
					<ListItem>
						<Bold>Service Providers:</Bold> We may share your information with
						third-party service providers who perform services on our behalf,
						such as payment processing, data analytics, email delivery, hosting
						services, and customer support. We use secure third-party payment
						gateways (such as Stripe, PayPal, and localized processors) to
						handle transactions.. These service providers are contractually
						obligated to protect your information.
					</ListItem>
					<ListItem>
						<Bold>Business Partners:</Bold> We *may* share your information with
						business partners who offer products or services that may be of
						interest to you.
					</ListItem>
					<ListItem>
						<Bold>Legal Authorities:</Bold> We may disclose your information to
						legal authorities if required by law or legal process, or if we
						believe in good faith that such disclosure is necessary to protect
						our rights, protect your safety or the safety of others, investigate
						fraud, or respond to a government request.
					</ListItem>
					<ListItem>
						<Bold>Affiliates: </Bold> We may disclose your information to our
						affiliates for purpose consistent with this privacy policy
					</ListItem>
					<ListItem>
						<Bold>Business Transfers</Bold> We may share of transfer your
						information in connection with a merger
					</ListItem>
				</List>

				<H2>5. Data Security</H2>
				<P>
					We take reasonable measures to protect your personal information from
					unauthorized access, use, or disclosure. However, no method of
					transmission over the internet or method of electronic storage is 100%
					secure. Therefore, we cannot guarantee absolute security.
				</P>

				<H2>6. Your Data Rights</H2>
				<P>
					You have certain rights regarding your personal information, including
					the right to:
				</P>
				<List>
					<ListItem>Access your personal information.</ListItem>
					<ListItem>Correct inaccurate personal information.</ListItem>
					<ListItem>Request deletion of your personal information.</ListItem>
					<ListItem>
						Object to the processing of your personal information.
					</ListItem>
					<ListItem>
						Request restriction of the processing of your personal information.
					</ListItem>
					<ListItem>
						Receive a copy of your personal information in a portable format.
					</ListItem>
				</List>
				<P>
					To exercise these rights, please contact us at support@scerv.com. We
					may need to verify your identity before processing your request.
				</P>

				<H2>7. Children's Privacy</H2>
				<P>
					The Service is not intended for children under the age of 13. We do
					not knowingly collect personal information from children. If you are a
					parent or guardian and believe that your child has provided us with
					personal information, please contact us.
				</P>

				<H2>9. Changes to this Privacy Policy</H2>
				<P>
					We may update our Privacy Policy from time to time. We will post any
					privacy policy changes on this page and, if the changes are
					significant, we will provide a more prominent notice (including, for
					certain services, email notification of privacy policy changes).
				</P>

				<H2>10. Contact Us</H2>
				<P>
					If you have any questions about this Privacy Policy, please contact us
					at: support@scerv.com
				</P>
			</Container>
		</PrivacyPolicySection>
	);
};

export default PrivacyPolicy;
