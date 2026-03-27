import React from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";

// --- Styled Components ---
const LandingContainer = styled.div`
    padding: 4rem 2rem;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: ${({ theme }) => theme.fonts?.main || "sans-serif"};
`;

const HeroSection = styled.div`
    text-align: center;
    margin-bottom: 3rem;
`;

const RestaurantName = styled.h1`
    font-size: 3rem;
    color: ${({ theme }) => theme.colors?.primary || "#E55B13"};
    margin-bottom: 0.5rem;
`;

const Description = styled.p`
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors?.textMedium || "#555"};
    max-width: 600px;
    margin: 0 auto;
`;

const ActionCard = styled.div`
    background: ${({ theme }) => theme.colors?.surface || "#fff"};
    padding: 2.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    text-align: center;
    width: 100%;
    max-width: 500px;
    margin-bottom: 3rem;
    border: 1px solid #eaeaea;
`;

const OrderButton = styled.a`
    display: inline-block;
    background-color: ${({ theme }) => theme.colors?.primary || "#E55B13"};
    color: white;
    font-size: 1.2rem;
    font-weight: bold;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-decoration: none;
    margin-bottom: 1rem;
    transition: opacity 0.2s;
    
    &:hover {
        opacity: 0.9;
    }
`;

const ComplianceGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    width: 100%;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #eaeaea;
    color: #444;
`;

const InfoBlock = styled.div`
    h3 {
        font-size: 1.1rem;
        color: #222;
        margin-bottom: 0.8rem;
    }
    p {
        margin: 0.3rem 0;
        font-size: 0.95rem;
        line-height: 1.5;
    }
`;

const PaymentLogos = styled.div`
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    align-items: center;
    flex-wrap: wrap;

    span {
        background: #f0f0f0;
        padding: 0.4rem 0.8rem;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: bold;
        color: #333;
    }
`;

const RestaurantLanding = () => {
    const { slug } = useParams();

    // In the future, you can fetch this data from Firestore based on the 'slug'
    // For now, we hardcode Daiquiri 23's details to get them compliant immediately.
    const restaurant = {
        name: "Daiquiri 23",
        legalName: "Daiquiri 23 S.A.", // MUST match their bank account entity
        description: "The best craft cocktails and local bites in Panama.",
        address: "Calle 47 Este, Marbella, Ciudad de Panamá, Panamá", // Real address required
        phone: "+507 6000-0000",
        email: "soporte@scerv.com", // Or the restaurant's direct email
        currency: "USD / PAB",
    };

    return (
        <LandingContainer>
            <HeroSection>
                <RestaurantName>{restaurant.name}</RestaurantName>
                <Description>{restaurant.description}</Description>
            </HeroSection>

            <ActionCard>
                <h2 style={{ marginBottom: "1.5rem", color: "#222" }}>Ready to Order?</h2>
                <OrderButton href="https://scerv.com/download"> {/* Or link to PWA */}
                    Open Menu in Scerv App
                </OrderButton>
                <p style={{ fontSize: "0.9rem", color: "#666" }}>
                    Scan the QR code at your table to order directly.
                </p>
            </ActionCard>

            {/* 🚨 dLocal Go Compliance Section 🚨 */}
            <ComplianceGrid>
                <InfoBlock>
                    <h3>Business Information</h3>
                    <p><strong>Legal Entity:</strong> {restaurant.legalName}</p>
                    <p><strong>Address:</strong> {restaurant.address}</p>
                    <p><strong>Phone:</strong> {restaurant.phone}</p>
                    <p><strong>Support Email:</strong> {restaurant.email}</p>
                </InfoBlock>

                <InfoBlock>
                    <h3>Payments & Currency</h3>
                    <p>All prices are listed in <strong>{restaurant.currency}</strong>.</p>
                    <p>Taxes (ITBMS) and service fees are calculated at checkout before payment.</p>
                    
                    <h3 style={{ marginTop: "1rem" }}>Accepted Payment Methods</h3>
                    {/* Displaying these clearly is a hard requirement for approval */}
                    <PaymentLogos>
                        <span>Visa</span>
                        <span>Mastercard</span>
                        <span>Clave</span>
                        <span>Yappy</span>
                    </PaymentLogos>
                </InfoBlock>
            </ComplianceGrid>
        </LandingContainer>
    );
};

export default RestaurantLanding;