// src/components/TermsOfService.js
import React from "react";
import styled from "styled-components";

const TOSSection = styled.section`
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

const TermsOfService = () => {
	return (
		<TOSSection>
			<Container>
				<H1>Scerv Terms of Service</H1>

				<P>Last Updated: Jan. 2025</P>

				<P>
					Welcome to Scerv! These Terms of Service ("Terms") govern your access
					to and use of the Scerv website, mobile application, and related
					services (collectively, the "Service"). Please read these Terms
					carefully before using the Service. By accessing or using the Service,
					you agree to be bound by these Terms. If you do not agree to these
					Terms, you may not access or use the Service.
				</P>

				<H2>1. Account Creation and Use</H2>
				<P>
					To use certain features of the Service, you may be required to create
					an account. You must provide accurate and complete information when
					creating your account. You are responsible for maintaining the
					confidentiality of your account credentials and for all activities
					that occur under your account. You agree to notify us immediately of
					any unauthorized use of your account.
				</P>
				<List>
					<ListItem>
						<Bold>Eligibility:</Bold> You must be at least 18 years old and have
						the legal capacity to enter into a contract to use the Service.
					</ListItem>
					<ListItem>
						<Bold>Account Security:</Bold> You are responsible for maintaining
						the confidentiality of your account password and for all activities
						that occur under your account.
					</ListItem>
					<ListItem>
						<Bold>Accurate Information:</Bold> You agree to provide accurate and
						complete information when creating your account and to keep your
						information updated.
					</ListItem>
					<ListItem>
						<Bold>Prohibited Activities:</Bold> You agree not to use the Service
						for any unlawful or prohibited purpose.
					</ListItem>
				</List>

				<H2>2. Service Description</H2>
				<P>
					Scerv provides a platform for restaurants to manage orders, streamline
					kitchen operations, and access analytics. The specific features and
					functionality of the Service may vary depending on your subscription
					plan.
				</P>
				<List>
					<ListItem>
						<Bold>Service Availability:</Bold> We strive to make the Service
						available 24/7, but we do not guarantee uninterrupted access. We may
						suspend or discontinue the Service, or any part of it, at any time
						for any reason.
					</ListItem>
					<ListItem>
						<Bold>Modifications to the Service:</Bold> We may modify or update
						the Service from time to time, including adding or removing
						features. We will endeavor to notify you of any material changes.
					</ListItem>
				</List>

				<H2>3. Fees and Payment</H2>
				<P>
					You agree to pay all fees associated with your use of the Service, as
					described in the pricing plan you select. Fees are non-refundable,
					except as required by law.
				</P>
				<List>
					<ListItem>
						<Bold>Subscription Fees:</Bold> If you subscribe to a paid plan, you
						will be charged the applicable fees on a recurring basis (e.g.,
						monthly or annually).
					</ListItem>
					<ListItem>
						<Bold>Payment Methods:</Bold> We accept various payment methods, as
						indicated on our website. You are responsible for providing valid
						payment information.
					</ListItem>
					<ListItem>
						<Bold>Taxes:</Bold> You are responsible for any applicable taxes,
						duties, or other governmental charges associated with your use of
						the Service.
					</ListItem>
					<ListItem>
						<Bold>Price Changes: </Bold>We may change our prices at any time. We
						will provide you with reasonable notice of any price changes.
					</ListItem>
				</List>

				<H2>4. Intellectual Property</H2>
				<P>
					The Service and its entire contents, features, and functionality
					(including but not limited to all information, software, text,
					displays, images, video, and audio, and the design, selection, and
					arrangement thereof) are owned by Scerv, its licensors, or other
					providers of such material and are protected by United States and
					international copyright, trademark, patent, trade secret, and other
					intellectual property or proprietary rights laws.
				</P>
				<List>
					<ListItem>
						<Bold>Ownership:</Bold> Scerv and its licensors retain all right,
						title, and interest in and to the Service, including all
						intellectual property rights.
					</ListItem>
					<ListItem>
						<Bold>License:</Bold> Subject to these Terms, Scerv grants you a
						limited, non-exclusive, non-transferable, revocable license to use
						the Service for your internal business purposes.
					</ListItem>
					<ListItem>
						<Bold>Restrictions:</Bold> You may not copy, modify, distribute,
						sell, or lease any part of the Service, nor may you reverse engineer
						or attempt to extract the source code of the Service.
					</ListItem>
					<ListItem>
						<Bold>User Content :</Bold>You retain ownership of any content you
						submit to the Service ("User Content"). By submitting User Content,
						you grant Scerv a worldwide, non-exclusive, royalty-free license to
						use, reproduce, modify, adapt, publish, translate, distribute, and
						display such User Content in connection with the Service.
					</ListItem>
				</List>

				<H2>5. User Conduct</H2>
				<P>You agree not to:</P>
				<List>
					<ListItem>
						Use the Service for any illegal or unauthorized purpose.
					</ListItem>
					<ListItem>Violate any applicable laws or regulations.</ListItem>
					<ListItem>
						Interfere with or disrupt the Service or servers or networks
						connected to the Service.
					</ListItem>
					<ListItem>
						Attempt to gain unauthorized access to the Service or any other
						user's account.
					</ListItem>
					<ListItem>
						Transmit any viruses, worms, or other malicious code.
					</ListItem>
					<ListItem>Harass, threaten, or intimidate other users.</ListItem>
					<ListItem>Impersonate any person or entity.</ListItem>
					<ListItem>
						Collect or store personal data about other users without their
						consent.
					</ListItem>
				</List>

				<H2>6. Disclaimer of Warranties</H2>
				<P>
					THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF
					ANY KIND, EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE
					IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
					PURPOSE, AND NON-INFRINGEMENT. SCERV DOES NOT WARRANT THAT THE SERVICE
					WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
				</P>

				<H2>7. Limitation of Liability</H2>
				<P>
					IN NO EVENT SHALL SCERV BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
					SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR
					REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF
					DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (A)
					YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE;
					(B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; (C) ANY
					CONTENT OBTAINED FROM THE SERVICE; OR (D) UNAUTHORIZED ACCESS, USE, OR
					ALTERATION OF YOUR TRANSMISSIONS OR CONTENT, WHETHER BASED ON
					WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), OR ANY OTHER LEGAL
					THEORY, WHETHER OR NOT SCERV HAS BEEN INFORMED OF THE POSSIBILITY OF
					SUCH DAMAGE.
				</P>

				<H2>8. Indemnification</H2>
				<P>
					You agree to indemnify and hold harmless Scerv and its officers,
					directors, employees, and agents from and against any and all claims,
					liabilities, damages, losses, costs, expenses, or fees (including
					reasonable attorneys' fees) arising out of or relating to your use of
					the Service or your violation of these Terms.
				</P>

				<H2>9. Termination</H2>
				<P>
					We may terminate or suspend your account and access to the Service
					immediately, without prior notice or liability, for any reason
					whatsoever, including without limitation if you breach these Terms.
					Upon termination, your right to use the Service will immediately
					cease.
				</P>
				<List>
					<ListItem>
						<Bold>Termination by You :</Bold>You may terminate your account at
						any time by contacting us.
					</ListItem>
					<ListItem>
						<Bold>Termination by Scerv:</Bold> Scerv may terminate your account
						and access to the Service at any time for any reason, including for
						violation of these Terms.
					</ListItem>
					<ListItem>
						<Bold>Effect of Termination:</Bold> Upon termination, your right to
						use the Service will cease, and we may delete your account and User
						Content.
					</ListItem>
				</List>

				<H2>10. Governing Law and Dispute Resolution</H2>
				<P>
					These Terms shall be governed by and construed in accordance with the
					laws of [Your State/Jurisdiction], without regard to its conflict of
					law provisions. Any dispute arising out of or relating to these Terms
					or the Service shall be resolved exclusively in the state or federal
					courts located in [Your City, State].
				</P>

				<H2>11. Changes to Terms</H2>
				<P>
					Scerv reserves the right to modify these Terms at any time. We will
					post the updated Terms on the Service, and your continued use of the
					Service after the posting of the revised Terms constitutes your
					acceptance of the changes.
				</P>
				<H2>12. Entire Agreement</H2>
				<P>
					These Terms constitute the entire agreement between you and Scerv
					regarding your use of the Service and supersede all prior or
					contemporaneous communications and proposals (whether oral, written,
					or electronic) between you and Scerv.
				</P>

				<H2>13. Contact Us</H2>
				<P>
					If you have any questions about these Terms, please contact us at
					support@scerv.com.
				</P>
			</Container>
		</TOSSection>
	);
};

export default TermsOfService;
