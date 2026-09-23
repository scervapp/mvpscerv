import React, { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link, useLocation, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import styled from "styled-components";
import BrowserGuestIdentity, {
	readStoredBrowserGuest,
} from "./BrowserGuestIdentity";
import {
	addBrowserBasketItem,
	createBrowserCheckoutSession,
	createBrowserTableSession,
	getMenuForRestaurant,
	getBrowserOrderStatus,
	removeBrowserBasketItem,
	resolveTableToken,
	slugify,
	submitBrowserMenuItemRating,
	submitBrowserServerRating,
	submitBrowserBasketToKitchen,
	syncBrowserCheckoutSession,
	updateBrowserBasketItem,
} from "../utils/browserOrderingData";
import { auth } from "../config/firebase";

const Page = styled.main`
	align-items: flex-start;
	background: #ffffff;
	background-position: center;
	background-size: cover;
	display: flex;
	justify-content: center;
	min-height: 100vh;
	padding: ${({ $hasBasket }) => ($hasBasket ? "0 0 92px" : "0")};

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		background:
			linear-gradient(135deg, rgba(8, 47, 58, 0.96), rgba(14, 111, 127, 0.86)),
			url("/logo512.png");
		padding: ${({ $hasBasket }) =>
			$hasBasket ? "24px 24px 96px" : "24px"};
	}
`;

const Panel = styled.section`
	background: #ffffff;
	border-radius: 0;
	box-shadow: none;
	max-width: ${({ $wide }) => ($wide ? "980px" : "560px")};
	padding: 20px;
	width: 100%;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		border-radius: 8px;
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.24);
		padding: 28px;
	}
`;

const TopBar = styled.div`
	align-items: center;
	display: flex;
	gap: 10px;
	justify-content: space-between;
	margin-bottom: 14px;
`;

const BrandMark = styled.span`
	color: ${({ theme }) => theme.colors.primary};
	font-size: 0.78rem;
	font-weight: 900;
	letter-spacing: 0.08em;
	text-transform: uppercase;
`;

const GuestBadge = styled.div`
	align-items: center;
	background: ${({ theme }) => theme.colors.accent};
	border: 1px solid rgba(14, 111, 127, 0.2);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	display: flex;
	font-size: 0.8rem;
	font-weight: 900;
	gap: 7px;
	max-width: 58%;
	padding: 7px 10px;

	span:first-child {
		background: ${({ theme }) => theme.colors.primary};
		border-radius: 999px;
		color: #ffffff;
		display: inline-grid;
		height: 22px;
		place-items: center;
		width: 22px;
	}

	span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
`;

const Eyebrow = styled.p`
	color: ${({ theme }) => theme.colors.primary};
	font-size: 0.78rem;
	font-weight: 900;
	letter-spacing: 0.08em;
	margin-bottom: 10px;
	text-transform: uppercase;
`;

const Title = styled.h1`
	font-size: clamp(2rem, 9vw, 3.2rem);
	line-height: 1;
	margin: 0 0 12px;
`;

const Body = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 1rem;
	line-height: 1.65;
	margin: 0 0 14px;
`;

const MetaRail = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 14px 0;
`;

const MetaChip = styled.span`
	align-items: center;
	background: ${({ theme }) => theme.colors.accent};
	border: 1px solid rgba(14, 111, 127, 0.16);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	display: inline-flex;
	font-size: 0.82rem;
	gap: 6px;
	font-weight: 800;
	min-height: 32px;
	padding: 0 10px;
`;

const ActionStack = styled.div`
	display: grid;
	gap: 10px;
	margin-top: 20px;
`;

const PrimaryAction = styled(Link)`
	background: ${({ theme }) => theme.colors.secondary};
	border-radius: 8px;
	color: #ffffff;
	font-weight: 900;
	padding: 13px 16px;
	text-align: center;

	&:hover {
		background: ${({ theme }) => theme.colors.secondaryDark};
		color: #ffffff;
	}
`;

const SecondaryAction = styled(Link)`
	border: 1px solid #cbd5d8;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	font-weight: 900;
	padding: 12px 16px;
	text-align: center;
`;

const LoadingText = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-weight: 800;
	margin: 0;
`;

const PrimaryButton = styled.button`
	background: ${({ theme }) => theme.colors.secondary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	min-height: 44px;
	padding: 0 14px;

	&:disabled {
		background: #cbd5d8;
		cursor: not-allowed;
	}
`;

const ErrorText = styled.p`
	color: ${({ theme }) => theme.colors.error};
	font-size: 0.86rem;
	font-weight: 800;
	margin: 0;
`;

const NoticeText = styled.p`
	background: ${({ $tone }) => ($tone === "success" ? "#ecfdf5" : "#fff7ed")};
	border: 1px solid
		${({ $tone }) =>
			$tone === "success"
				? "rgba(40, 167, 69, 0.26)"
				: "rgba(241, 130, 32, 0.24)"};
	border-radius: 8px;
	color: ${({ $tone, theme }) =>
		$tone === "success" ? theme.colors.success : theme.colors.secondaryDark};
	font-size: 0.86rem;
	font-weight: 900;
	line-height: 1.35;
	margin: 12px 0 0;
	padding: 10px 12px;
`;

const SyncChip = styled.span`
	background: ${({ $status }) => ($status === "synced" ? "#ecfdf5" : "#fff7ed")};
	border: 1px solid
		${({ $status }) =>
			$status === "synced"
				? "rgba(40, 167, 69, 0.26)"
				: "rgba(241, 130, 32, 0.24)"};
	border-radius: 999px;
	color: ${({ $status, theme }) =>
		$status === "synced" ? theme.colors.success : theme.colors.secondaryDark};
	flex: 0 0 auto;
	font-size: 0.72rem;
	font-weight: 900;
	padding: 5px 8px;
`;

const CompactSessionBar = styled.div`
	align-items: center;
	background: #f7f8f8;
	border: 1px solid ${({ theme }) => theme.colors.gray};
	border-radius: 8px;
	display: flex;
	gap: 10px;
	justify-content: space-between;
	margin-top: 14px;
	padding: 10px 12px;
`;

const SessionSummary = styled.div`
	color: ${({ theme }) => theme.colors.text};
	font-size: 0.9rem;
	font-weight: 900;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

const SessionActions = styled.div`
	align-items: center;
	display: flex;
	flex: 0 0 auto;
	gap: 7px;
`;

const InfoButton = styled.button`
	align-items: center;
	background: #ffffff;
	border: 1px solid #cbd5d8;
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primary};
	cursor: pointer;
	display: inline-flex;
	flex: 0 0 auto;
	font: inherit;
	font-size: 0.82rem;
	font-weight: 900;
	height: 30px;
	justify-content: center;
	width: 30px;
`;

const ShareTableButton = styled(InfoButton)`
	gap: 6px;
	padding: 0 10px;
	width: auto;
`;

const SessionDetails = styled.div`
	background: #ffffff;
	border: 1px solid #e4eaec;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.textLight};
	display: grid;
	font-size: 0.84rem;
	gap: 7px;
	line-height: 1.35;
	margin-top: 8px;
	padding: 10px 12px;
`;

const PartyMemberRail = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 7px;
	margin-top: 8px;
`;

const PartyMemberChip = styled.span`
	align-items: center;
	background: #eef7f9;
	border: 1px solid rgba(14, 111, 127, 0.16);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	display: inline-flex;
	font-size: 0.78rem;
	font-weight: 900;
	gap: 6px;
	min-height: 30px;
	padding: 0 10px;
`;

const BasketShell = styled.div`
	border-top: 1px solid #edf1f2;
	display: grid;
	gap: 18px;
	grid-template-columns: minmax(0, 1fr) 320px;
	margin-top: 22px;
	padding-top: 22px;

	@media (max-width: ${({ theme }) => theme.breakpoints.md}) {
		grid-template-columns: 1fr;
	}
`;

const MenuSection = styled.section`
	display: grid;
	gap: 14px;
`;

const SectionHeader = styled.div`
	align-items: flex-end;
	display: flex;
	gap: 12px;
	justify-content: space-between;
`;

const SectionTitle = styled.h2`
	font-size: 1.15rem;
	margin: 0;
`;

const SectionHint = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.86rem;
	font-weight: 700;
	margin: 0;
`;

const CategoryBlock = styled.div`
	display: grid;
	gap: 10px;
`;

const CategoryTitle = styled.h3`
	color: ${({ theme }) => theme.colors.primaryDark};
	font-size: 0.78rem;
	font-weight: 900;
	letter-spacing: 0.08em;
	margin: 4px 0 0;
	text-transform: uppercase;
`;

const MenuItemCard = styled.article`
	align-items: start;
	border: 1px solid #e4eaec;
	border-radius: 8px;
	display: grid;
	gap: 12px;
	grid-template-columns: 76px minmax(0, 1fr);
	padding: 10px;
`;

const MenuThumb = styled.div`
	background:
		linear-gradient(135deg, rgba(14, 111, 127, 0.16), rgba(241, 130, 32, 0.16)),
		url("${({ $image }) => $image}");
	background-position: center;
	background-size: cover;
	border-radius: 7px;
	height: 76px;
	width: 76px;
`;

const MenuItemBody = styled.div`
	display: grid;
	gap: 8px;
	min-width: 0;
`;

const ItemStatusRow = styled.div`
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
`;

const AddedChip = styled.span`
	background: ${({ theme }) => theme.colors.accent};
	border: 1px solid rgba(14, 111, 127, 0.2);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	font-size: 0.78rem;
	font-weight: 900;
	padding: 5px 9px;
`;

const MenuItemTop = styled.div`
	align-items: flex-start;
	display: flex;
	gap: 10px;
	justify-content: space-between;
`;

const ItemName = styled.h4`
	font-size: 0.98rem;
	line-height: 1.25;
	margin: 0;
`;

const ItemPrice = styled.strong`
	color: ${({ theme }) => theme.colors.primary};
	flex: 0 0 auto;
	font-size: 0.92rem;
`;

const ItemDescription = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	display: -webkit-box;
	font-size: 0.86rem;
	line-height: 1.38;
	margin: 0;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
`;

const ItemActions = styled.div`
	display: grid;
	gap: 8px;
	grid-template-columns: minmax(0, 1fr) auto;
`;

const NoteInput = styled.input`
	border: 1px solid #d8e1e4;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	font: inherit;
	font-size: 0.88rem;
	min-height: 38px;
	padding: 0 10px;
	width: 100%;
`;

const AddButton = styled.button`
	background: ${({ theme }) => theme.colors.primary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-size: 0.88rem;
	font-weight: 900;
	min-height: 38px;
	padding: 0 13px;

	&:disabled {
		background: #b8c4c8;
		cursor: wait;
	}
`;

const BasketPanel = styled.aside`
	align-self: start;
	background: #f7f8f8;
	border: 1px solid #dfe5e7;
	border-radius: 8px;
	display: grid;
	gap: 12px;
	padding: 14px;
`;

const StickyBasketBar = styled.div`
	background: #ffffff;
	border: 1px solid rgba(14, 111, 127, 0.2);
	border-radius: 8px 8px 0 0;
	bottom: 0;
	box-shadow: 0 -16px 40px rgba(3, 19, 24, 0.18);
	display: grid;
	gap: ${({ $expanded }) => ($expanded ? "12px" : "0")};
	left: 50%;
	max-width: 980px;
	padding: 12px 14px;
	position: fixed;
	transform: translateX(-50%);
	width: 100%;
	z-index: 20;

	@media (min-width: ${({ theme }) => theme.breakpoints.md}) {
		width: calc(100% - 28px);
	}
`;

const StickyBasketTop = styled.div`
	align-items: center;
	display: flex;
	gap: 12px;
	justify-content: space-between;
`;

const StickyBasketSummary = styled.div`
	display: grid;
	gap: 2px;
	min-width: 0;

	strong {
		color: ${({ theme }) => theme.colors.text};
		font-size: 0.95rem;
	}

	span {
		color: ${({ theme }) => theme.colors.textLight};
		font-size: 0.78rem;
		font-weight: 800;
	}
`;

const StickyBasketButton = styled.button`
	background: ${({ theme }) => theme.colors.secondary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	flex: 0 0 auto;
	font: inherit;
	font-size: 0.88rem;
	font-weight: 900;
	min-height: 42px;
	padding: 0 14px;
`;

const StickyTotalsDrawer = styled.div`
	border-top: 1px solid #e4eaec;
	display: grid;
	gap: 10px;
	padding-top: 12px;
`;

const TotalsLine = styled.div`
	align-items: center;
	color: ${({ theme }) => theme.colors.text};
	display: flex;
	font-size: 0.88rem;
	font-weight: 800;
	justify-content: space-between;

	span:first-child {
		color: ${({ theme }) => theme.colors.textLight};
	}
`;

const TotalsLineStrong = styled(TotalsLine)`
	border-top: 1px solid #edf1f2;
	font-size: 1rem;
	font-weight: 900;
	padding-top: 10px;

	span:first-child {
		color: ${({ theme }) => theme.colors.text};
	}
`;

const EmptyBasket = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.9rem;
	line-height: 1.45;
	margin: 0;
`;

const BasketItem = styled.div`
	background: #ffffff;
	border: 1px solid #e4eaec;
	border-radius: 8px;
	display: grid;
	gap: 8px;
	padding: 10px;
`;

const SentChip = styled.span`
	background: #ecfdf5;
	border: 1px solid rgba(40, 167, 69, 0.26);
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.success};
	font-size: 0.74rem;
	font-weight: 900;
	padding: 4px 8px;
`;

const StatusChip = styled.span`
	background: ${({ $tone }) => {
		if ($tone === "ready") return "#ecfdf5";
		if ($tone === "active") return "#fff7ed";
		if ($tone === "waiting") return "#f5f3ff";
		return "#eef7f9";
	}};
	border: 1px solid
		${({ $tone }) => {
			if ($tone === "ready") return "rgba(40, 167, 69, 0.28)";
			if ($tone === "active") return "rgba(241, 130, 32, 0.26)";
			if ($tone === "waiting") return "rgba(124, 58, 237, 0.24)";
			return "rgba(14, 111, 127, 0.2)";
		}};
	border-radius: 999px;
	color: ${({ $tone, theme }) => {
		if ($tone === "ready") return theme.colors.success;
		if ($tone === "active") return theme.colors.secondaryDark;
		if ($tone === "waiting") return "#6d28d9";
		return theme.colors.primary;
	}};
	display: inline-flex;
	font-size: 0.74rem;
	font-weight: 900;
	margin-top: 4px;
	padding: 4px 8px;
`;

const SentSummaryButton = styled.button`
	align-items: center;
	background: #ecfdf5;
	border: 1px solid rgba(40, 167, 69, 0.28);
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	cursor: pointer;
	display: flex;
	font: inherit;
	font-weight: 900;
	justify-content: space-between;
	min-height: 44px;
	padding: 10px 12px;
	text-align: left;
	width: 100%;

	span {
		color: ${({ theme }) => theme.colors.success};
		font-size: 0.82rem;
	}
`;

const SentItemsList = styled.div`
	display: grid;
	gap: 8px;
`;

const SentItemRow = styled.div`
	align-items: center;
	background: #ffffff;
	border: 1px solid #d8eadf;
	border-radius: 8px;
	display: flex;
	gap: 10px;
	justify-content: space-between;
	padding: 9px 10px;
`;

const BasketItemTop = styled.div`
	display: flex;
	gap: 10px;
	justify-content: space-between;
`;

const BasketName = styled.strong`
	color: ${({ theme }) => theme.colors.text};
	font-size: 0.92rem;
	line-height: 1.25;
`;

const BasketMeta = styled.p`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.8rem;
	margin: 0;
`;

const QuantityRow = styled.div`
	align-items: center;
	display: flex;
	gap: 8px;
	justify-content: space-between;
`;

const QuantityControls = styled.div`
	align-items: center;
	display: flex;
	gap: 7px;
`;

const QuantityButton = styled.button`
	background: #ffffff;
	border: 1px solid #cbd5d8;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	height: 30px;
	width: 34px;

	&:disabled {
		cursor: wait;
		opacity: 0.6;
	}
`;

const RemoveButton = styled.button`
	background: transparent;
	border: 0;
	color: ${({ theme }) => theme.colors.error};
	cursor: pointer;
	font: inherit;
	font-size: 0.8rem;
	font-weight: 900;
	padding: 0;
`;

const BasketTotal = styled.div`
	border-top: 1px solid #dfe5e7;
	display: flex;
	font-weight: 900;
	justify-content: space-between;
	padding-top: 12px;
`;

const TipControl = styled.div`
	border-top: 1px solid #dfe5e7;
	display: grid;
	gap: 9px;
	padding-top: 12px;
`;

const TipHeader = styled.div`
	align-items: center;
	display: flex;
	font-size: 0.88rem;
	font-weight: 900;
	justify-content: space-between;
`;

const TipOptions = styled.div`
	display: grid;
	gap: 7px;
	grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
`;

const TipButton = styled.button`
	background: ${({ $active, theme }) => ($active ? theme.colors.primary : "#ffffff")};
	border: 1px solid
		${({ $active, theme }) => ($active ? theme.colors.primary : "#cbd5d8")};
	border-radius: 8px;
	color: ${({ $active, theme }) => ($active ? "#ffffff" : theme.colors.text)};
	cursor: pointer;
	font: inherit;
	font-size: 0.78rem;
	font-weight: 900;
	min-height: 34px;
`;

const CustomTipInput = styled.input`
	border: 1px solid #cbd5d8;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	font: inherit;
	font-size: 0.9rem;
	font-weight: 800;
	min-height: 38px;
	padding: 0 10px;
	width: 100%;
`;

const DisabledCheckout = styled.button`
	background: ${({ disabled, theme }) =>
		disabled ? "#cbd5d8" : theme.colors.secondary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
	font: inherit;
	font-weight: 900;
	min-height: 44px;
`;

const ConfirmationPanel = styled.section`
	background: #f7fbfb;
	border: 1px solid rgba(14, 111, 127, 0.16);
	border-radius: 8px;
	display: grid;
	gap: 14px;
	margin-top: 18px;
	padding: 16px;
`;

const ConfirmationHeader = styled.div`
	display: grid;
	gap: 5px;
`;

const ConfirmationTitle = styled.h2`
	color: ${({ theme }) => theme.colors.text};
	font-size: 1.2rem;
	margin: 0;
`;

const ReceiptPanel = styled.section`
	background: #ffffff;
	border: 1px solid #e4eaec;
	border-radius: 8px;
	display: grid;
	gap: 12px;
	padding: 14px;
`;

const ReceiptStatus = styled.div`
	align-items: center;
	background: #ecfdf5;
	border: 1px solid rgba(40, 167, 69, 0.25);
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.success};
	display: flex;
	font-size: 0.84rem;
	font-weight: 900;
	justify-content: space-between;
	padding: 10px 12px;
`;

const ReceiptOrderValue = styled.span`
	color: ${({ theme }) => theme.colors.text};
	font-size: 0.78rem;
	font-weight: 900;
	overflow-wrap: anywhere;
	text-align: right;
`;

const ReceiptItems = styled.div`
	display: grid;
	gap: 9px;
`;

const ReceiptItemRow = styled.div`
	align-items: flex-start;
	display: flex;
	gap: 12px;
	justify-content: space-between;
`;

const ReceiptItemMeta = styled.div`
	display: grid;
	gap: 3px;
	min-width: 0;
`;

const ReceiptItemName = styled.strong`
	color: ${({ theme }) => theme.colors.text};
	font-size: 0.9rem;
	line-height: 1.25;
`;

const ReceiptItemDetail = styled.span`
	color: ${({ theme }) => theme.colors.textLight};
	font-size: 0.78rem;
	font-weight: 800;
`;

const ReceiptItemAmount = styled.span`
	color: ${({ theme }) => theme.colors.text};
	flex: 0 0 auto;
	font-size: 0.88rem;
	font-weight: 900;
`;

const ReceiptTotals = styled.div`
	border-top: 1px solid #edf1f2;
	display: grid;
	gap: 8px;
	padding-top: 12px;
`;

const PaidPageHeader = styled.div`
	background: linear-gradient(135deg, #082f3a, #0e6f7f);
	border-radius: 8px;
	color: #ffffff;
	display: grid;
	gap: 8px;
	padding: 18px;
`;

const PaidPageTitle = styled.h1`
	font-size: clamp(1.75rem, 7vw, 2.4rem);
	line-height: 1.05;
	margin: 0;
`;

const PaidPageText = styled.p`
	color: rgba(255, 255, 255, 0.86);
	font-size: 0.98rem;
	line-height: 1.5;
	margin: 0;
`;

const AppDownloadPanel = styled.section`
	background: #fff7ed;
	border: 1px solid #fed7aa;
	border-radius: 8px;
	display: grid;
	gap: 12px;
	margin-top: 14px;
	padding: 14px;
`;

const AppDownloadActions = styled.div`
	display: grid;
	gap: 8px;
	grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
`;

const StoreLinkButton = styled.a`
	align-items: center;
	background: ${({ theme }) => theme.colors.text};
	border-radius: 8px;
	color: #ffffff;
	display: inline-flex;
	font-size: 0.86rem;
	font-weight: 900;
	justify-content: center;
	min-height: 42px;
	text-decoration: none;
`;

const ConfirmationActions = styled.div`
	display: grid;
	gap: 9px;
	margin-top: 14px;
`;

const CloseWindowButton = styled.button`
	background: ${({ theme }) => theme.colors.primary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: pointer;
	font: inherit;
	font-weight: 900;
	min-height: 44px;
`;

const RatingList = styled.div`
	display: grid;
	gap: 10px;
`;

const RatingCard = styled.article`
	background: #ffffff;
	border: 1px solid #e4eaec;
	border-radius: 8px;
	display: grid;
	gap: 10px;
	padding: 12px;
`;

const RatingCardTop = styled.div`
	align-items: flex-start;
	display: flex;
	gap: 10px;
	justify-content: space-between;
`;

const StarRow = styled.div`
	display: flex;
	gap: 5px;
`;

const StarButton = styled.button`
	background: transparent;
	border: 0;
	color: ${({ $active }) => ($active ? "#f59e0b" : "#cbd5d8")};
	cursor: pointer;
	font-size: 1.6rem;
	line-height: 1;
	padding: 0;
`;

const TagRow = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 7px;
`;

const ReviewTagButton = styled.button`
	background: ${({ $active, theme }) => ($active ? theme.colors.accent : "#ffffff")};
	border: 1px solid
		${({ $active, theme }) => ($active ? theme.colors.primary : "#d8e1e4")};
	border-radius: 999px;
	color: ${({ theme }) => theme.colors.primaryDark};
	cursor: pointer;
	font: inherit;
	font-size: 0.78rem;
	font-weight: 900;
	min-height: 30px;
	padding: 0 10px;
`;

const ReviewInput = styled.textarea`
	border: 1px solid #d8e1e4;
	border-radius: 8px;
	color: ${({ theme }) => theme.colors.text};
	font: inherit;
	font-size: 0.88rem;
	min-height: 70px;
	padding: 10px;
	resize: vertical;
	width: 100%;
`;

const RatingSubmitButton = styled.button`
	background: ${({ disabled, theme }) =>
		disabled ? "#cbd5d8" : theme.colors.primary};
	border: 0;
	border-radius: 8px;
	color: #ffffff;
	cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
	font: inherit;
	font-weight: 900;
	min-height: 40px;
`;

const normalizeRestaurant = (restaurantId, data = {}) => {
	return {
		id: restaurantId,
		...data,
		displayName: data.restaurantName || data.name || "Restaurant",
		slug:
			data.slug ||
			data.restaurantSlug ||
			data.publicSlug ||
			slugify(data.restaurantName || data.name || restaurantId),
	};
};

const formatCents = (value) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(Number(value || 0) / 100);

const formatPrice = (value) => {
	const numericValue = Number(value || 0);
	if (!Number.isFinite(numericValue)) return "$0.00";
	return formatCents(Math.round(numericValue * 100));
};

const normalizeDisplayTaxRate = (value) => {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return parsed > 1 ? parsed / 100 : parsed;
};

const formatTaxLabel = (taxRate) => {
	if (!taxRate) return "Estimated tax";
	const percentText = (taxRate * 100).toFixed(2).replace(/\.00$/, "");
	return `Estimated tax (${percentText}%)`;
};

const groupMenuItems = (items = []) =>
	items.reduce((groups, item) => {
		const category = item.category || item.menuCategory || "Menu";
		if (!groups[category]) groups[category] = [];
		groups[category].push(item);
		return groups;
	}, {});

const getFallbackSentStatus = (item = {}) => {
	if (item.pacingStatus === "scheduled") {
		return { label: "Scheduled", tone: "waiting" };
	}
	if (item.pacingStatus === "held") {
		return { label: "Waiting to fire", tone: "waiting" };
	}
	return { label: "Kitchen received", tone: "sent" };
};

const FOOD_REVIEW_TAGS = ["Standout", "Great flavor", "Fresh", "Would reorder"];
const SERVER_REVIEW_TAGS = ["Attentive", "Warm", "Fast", "Helpful"];
const SCERV_IOS_APP_URL = "https://apps.apple.com/app/id1591335061";
const SCERV_ANDROID_APP_URL =
	"https://play.google.com/store/apps/details?id=com.scerv.eat";
const PUBLIC_RESTAURANT_CART_PREFIX = "scerv_public_restaurant_cart:";

const makeRatingKey = (item = {}) => item.menuItemId || item.id || "";

const toggleListValue = (values = [], value) =>
	values.includes(value)
		? values.filter((entry) => entry !== value)
		: [...values, value];

const TABLE_CACHE_PREFIX = "scerv_browser_table:";
const TABLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SESSION_JOIN_TIMEOUT_MS = 12000;

const getTableCacheKey = (token) => `${TABLE_CACHE_PREFIX}${String(token || "").trim()}`;

const readJsonCache = (key) => {
	if (!key || typeof window === "undefined") return null;
	try {
		const cached = window.localStorage.getItem(key);
		return cached ? JSON.parse(cached) : null;
	} catch (error) {
		console.warn("Unable to read Scerv browser cache:", error);
		return null;
	}
};

const writeJsonCache = (key, value) => {
	if (!key || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			key,
			JSON.stringify({
				...value,
				cachedAt: Date.now(),
			}),
		);
	} catch (error) {
		console.warn("Unable to write Scerv browser cache:", error);
	}
};

const removeJsonCache = (key) => {
	if (!key || typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(key);
	} catch (error) {
		console.warn("Unable to clear Scerv browser cache:", error);
	}
};

const isFreshCache = (cached) =>
	cached &&
	Number.isFinite(Number(cached.cachedAt)) &&
	Date.now() - Number(cached.cachedAt) < TABLE_CACHE_TTL_MS;

const readCachedTableExperience = (token) => {
	const cached = readJsonCache(getTableCacheKey(token));
	return isFreshCache(cached) ? cached : null;
};

const withTimeout = (promise, timeoutMs, message) =>
	Promise.race([
		promise,
		new Promise((_, reject) => {
			window.setTimeout(() => reject(new Error(message)), timeoutMs);
		}),
	]);

const getFriendlySessionError = (error) => {
	const message = String(error?.message || "");
	if (/already in use/i.test(message)) {
		return "This table is already open. Ask the restaurant team to clean and release it, then scan again.";
	}
	if (/no longer accepting|expired|voided|closed/i.test(message)) {
		return "This table session was closed by the restaurant. Scan the table again to start a new order.";
	}
	if (/timed out/i.test(message)) {
		return message;
	}
	return message || "We could not connect this browser to the table.";
};

const getCachedSessionForGuest = (cachedExperience, guestId) => {
	if (!cachedExperience || !guestId) return null;
	const sessionByGuest = cachedExperience.sessionByGuest || {};
	return sessionByGuest[guestId] || null;
};

const updateCachedTableExperience = (token, patch) => {
	const key = getTableCacheKey(token);
	const current = readJsonCache(key) || {};
	writeJsonCache(key, {
		...current,
		...patch,
	});
};

const cacheBrowserSession = ({ token, guestId, session, basket }) => {
	if (!token || !guestId || !session) return;
	const key = getTableCacheKey(token);
	const current = readJsonCache(key) || {};
	const sessionByGuest = current.sessionByGuest || {};
	writeJsonCache(key, {
		...current,
		sessionByGuest: {
			...sessionByGuest,
			[guestId]: {
				session,
				basket,
				cachedAt: Date.now(),
			},
		},
	});
};

const StarRatingControl = ({ value = 0, onChange, disabled = false, label }) => (
	<StarRow aria-label={label || "Rating"}>
		{[1, 2, 3, 4, 5].map((star) => (
			<StarButton
				$active={star <= Number(value || 0)}
				aria-label={`${star} star${star === 1 ? "" : "s"}`}
				disabled={disabled}
				key={star}
				onClick={() => onChange?.(star)}
				type="button"
			>
				★
			</StarButton>
		))}
	</StarRow>
);

const ScanRedirect = () => {
	const { token } = useParams();
	const location = useLocation();
	const basketPanelRef = useRef(null);
	const sessionSyncAttemptedRef = useRef(false);
	const checkoutSyncAttemptedRef = useRef("");
	const importedPublicCartRef = useRef(false);
	const cachedExperience = useMemo(() => readCachedTableExperience(token), [token]);
	const initialGuest = useMemo(() => readStoredBrowserGuest(), []);
	const cachedGuestSession = useMemo(
		() => getCachedSessionForGuest(cachedExperience, initialGuest?.uid),
		[cachedExperience, initialGuest?.uid],
	);
	const [state, setState] = useState(() => ({
		status: cachedExperience?.restaurant && cachedExperience?.table
			? "ready"
			: token
				? "loading"
				: "manual",
		restaurant: cachedExperience?.restaurant || null,
		table: cachedExperience?.table || null,
		menuCount:
			cachedExperience?.menuCount ||
			(cachedExperience?.menuItems || []).length ||
			0,
		menuItems: cachedExperience?.menuItems || [],
	}));
	const [guest, setGuest] = useState(() => initialGuest);
	const [browserSession, setBrowserSession] = useState(
		() => cachedGuestSession?.session || null,
	);
	const [basket, setBasket] = useState(() => ({
		items: cachedGuestSession?.basket?.items || [],
		subtotalCents: cachedGuestSession?.basket?.subtotalCents || 0,
		itemCount: cachedGuestSession?.basket?.itemCount || 0,
		status: cachedGuestSession?.basket?.status || "empty",
	}));
	const [basketBusy, setBasketBusy] = useState("");
	const [checkoutBusy, setCheckoutBusy] = useState(false);
	const [itemNotes, setItemNotes] = useState({});
	const [authUserId, setAuthUserId] = useState(() => auth.currentUser?.uid || "");
	const [showSessionDetails, setShowSessionDetails] = useState(false);
	const [showSentItems, setShowSentItems] = useState(false);
	const [sessionLoading, setSessionLoading] = useState(false);
	const [sessionError, setSessionError] = useState("");
	const [shareNotice, setShareNotice] = useState("");
	const [syncStatus, setSyncStatus] = useState(
		cachedExperience ? "syncing" : "synced",
	);
	const [orderStatusByItemId, setOrderStatusByItemId] = useState({});
	const [submissionResult, setSubmissionResult] = useState(null);
	const [tipChoice, setTipChoice] = useState("18");
	const [customTipValue, setCustomTipValue] = useState("");
	const [isCheckoutDrawerOpen, setIsCheckoutDrawerOpen] = useState(false);
	const orderingEnabled = state.restaurant?.features?.qrSelfCheckIn === true;
	const paymentQuery = useMemo(() => {
		const queryParams = new URLSearchParams(location.search);
		return {
			checkoutSessionId: queryParams.get("checkout_session_id") || "",
			orderId: queryParams.get("orderId") || "",
			payment: queryParams.get("payment") || "",
		};
	}, [location.search]);
	const paymentNotice = paymentQuery.payment;
	const [checkoutStatus, setCheckoutStatus] = useState(
		paymentNotice === "success" ? "processing" : "",
	);
	const [paidConfirmation, setPaidConfirmation] = useState(null);
	const [itemRatings, setItemRatings] = useState({});
	const [serverRating, setServerRating] = useState({
		ratingValue: 0,
		feedbackText: "",
		feedbackTags: [],
		submitted: false,
	});
	const [ratingBusy, setRatingBusy] = useState("");
	const [ratingNotice, setRatingNotice] = useState("");
	const [closeWindowNotice, setCloseWindowNotice] = useState("");
	const menuGroups = useMemo(
		() => groupMenuItems(state.menuItems),
		[state.menuItems],
	);
	const draftBasketItems = useMemo(
		() =>
			(basket.items || []).filter((item) => (item.status || "draft") === "draft"),
		[basket.items],
	);
	const sentBasketItems = useMemo(
		() => (basket.items || []).filter((item) => item.status === "sent"),
		[basket.items],
	);
	const basketQuantityByMenuItem = useMemo(
		() =>
			draftBasketItems.reduce((totals, item) => {
				if (!item.menuItemId) return totals;
				return {
					...totals,
					[item.menuItemId]:
						Number(totals[item.menuItemId] || 0) +
						Number(item.quantity || 0),
				};
			}, {}),
		[draftBasketItems],
	);
	const draftItemCount = draftBasketItems.reduce(
		(total, item) => total + Number(item.quantity || 0),
		0,
	);
	const draftSubtotalCents = draftBasketItems.reduce(
		(total, item) => total + Number(item.lineTotalCents || 0),
		0,
	);
	const sentItemCount = sentBasketItems.reduce(
		(total, item) => total + Number(item.quantity || 0),
		0,
	);
	const sentSubtotalCents = sentBasketItems.reduce(
		(total, item) => total + Number(item.lineTotalCents || 0),
		0,
	);
	const customTipCents = Math.max(
		0,
		Math.round(Number(String(customTipValue || "").replace(/[^0-9.]/g, "")) * 100),
	);
	const browserGratuityCents =
		tipChoice === "cash"
			? 0
			: tipChoice === "custom"
				? customTipCents
				: Math.round(sentSubtotalCents * (Number(tipChoice || 0) / 100));
	const browserTaxRate = normalizeDisplayTaxRate(state.restaurant?.taxRate);
	const browserEstimatedTaxCents = Math.round(sentSubtotalCents * browserTaxRate);
	const browserEstimatedBeforeServiceCents =
		sentSubtotalCents + browserGratuityCents + browserEstimatedTaxCents;
	const basketFingerprint = useMemo(
		() =>
			draftBasketItems
				.map((item) => `${item.id}:${item.quantity}:${item.notes || ""}`)
				.sort()
				.join("|"),
		[draftBasketItems],
	);
	const isSessionReady = Boolean(browserSession?.id && !browserSession.isPending);
	const checkoutFinalizing =
		paymentNotice === "success" &&
		checkoutStatus !== "needs_attention" &&
		checkoutStatus !== "expired";
	const paidConfirmationItems = paidConfirmation?.items || [];
	const canRateServer = Boolean(
		paidConfirmation?.server?.id &&
			paidConfirmation.server.id !== "unassigned" &&
			paidConfirmation.server.id !== "browser_qr",
	);
	const tablePartyMembers = useMemo(
		() =>
			(Array.isArray(browserSession?.partyMembers)
				? browserSession.partyMembers
				: []
			).filter((member) => member?.userId),
		[browserSession?.partyMembers],
	);
	const tableGuestCount = Math.max(
		Number(browserSession?.guestCount || 0),
		tablePartyMembers.length,
		browserSession ? 1 : 0,
	);
	const showCheckoutControls = sentItemCount > 0 && !checkoutFinalizing;
	const showStickyBasket = Boolean(
		browserSession &&
			(draftItemCount > 0 ||
				showCheckoutControls ||
				(checkoutFinalizing && sentItemCount > 0)),
	);

	const scrollToBasket = () => {
		if (!basketPanelRef.current) return;
		basketPanelRef.current.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	const handleShareTableLink = async () => {
		const tableUrl = `${window.location.origin}${window.location.pathname}`;
		setShareNotice("");

		try {
			if (navigator.share) {
				await navigator.share({
					title: `${state.restaurant?.displayName || "Scerv"} table`,
					text: `Join me at ${state.restaurant?.displayName || "this table"} on Scerv.`,
					url: tableUrl,
				});
				setShareNotice("Table link ready to share.");
				return;
			}

			await navigator.clipboard.writeText(tableUrl);
			setShareNotice("Table link copied.");
		} catch (error) {
			if (error && error.name === "AbortError") return;
			console.error("Share browser table link failed:", error);
			setShareNotice("Could not share automatically. Copy the page link instead.");
		}
	};

	const applyBasket = (nextBasket) => {
		if (!nextBasket) return;
		setBasket(nextBasket);
		if (browserSession?.id && guest?.uid && !browserSession.isPending) {
			cacheBrowserSession({
				token,
				guestId: guest.uid,
				session: browserSession,
				basket: nextBasket,
			});
		}
	};

	const applySessionResult = (result) => {
		const nextSession = result?.session || null;
		const nextBasket = result?.basket || basket;

		if (nextSession) {
			setBrowserSession(nextSession);
			if (result?.basket) setBasket(result.basket);
			cacheBrowserSession({
				token,
				guestId: guest?.uid,
				session: nextSession,
				basket: nextBasket,
			});
		} else if (result?.basket) {
			applyBasket(result.basket);
		}

		setSyncStatus("synced");
	};

	useEffect(() => {
		sessionSyncAttemptedRef.current = false;
	}, [token, guest?.uid]);

	useEffect(() => {
		return onAuthStateChanged(auth, (currentUser) => {
			setAuthUserId(currentUser?.uid || "");
		});
	}, []);

	useEffect(() => {
		let isMounted = true;

		const resolveToken = async () => {
			if (!token) return;

			try {
				setSyncStatus("syncing");
				const resolved = await resolveTableToken(token);
				if (!isMounted) return;

				if (!resolved?.restaurantId) {
					removeJsonCache(getTableCacheKey(token));
					setState({
						status: "not_found",
						restaurant: null,
						table: null,
						menuCount: 0,
						menuItems: [],
					});
					setSyncStatus("synced");
					return;
				}

				const restaurant = normalizeRestaurant(
					resolved.restaurantId,
					resolved.restaurant,
				);
				const menuItems = await getMenuForRestaurant(resolved.restaurantId);
				if (!isMounted) return;

				setState({
					status: "ready",
					restaurant,
					table: resolved.table,
					menuCount: menuItems.length,
					menuItems,
				});
				updateCachedTableExperience(token, {
					restaurant,
					table: resolved.table,
					menuCount: menuItems.length,
					menuItems,
				});
				setSyncStatus("synced");
			} catch (error) {
				console.error("ScanRedirect token resolution failed:", error);
				if (isMounted) {
					setSyncStatus("synced");
					if (cachedExperience?.restaurant && cachedExperience?.table) {
						setSessionError(
							"We could not refresh the table yet. Showing the last loaded menu.",
						);
						return;
					}
					setState({
						status: "error",
						restaurant: null,
						table: null,
						menuCount: 0,
						menuItems: [],
					});
				}
			}
		};

		resolveToken();
		return () => {
			isMounted = false;
		};
	}, [token, cachedExperience?.restaurant, cachedExperience?.table]);

	const handleStartBrowserSession = async ({ optimistic = true } = {}) => {
		if (!guest?.uid || !authUserId || !token || sessionLoading) return;

		setSessionLoading(true);
		setSessionError("");
		setSyncStatus("syncing");
		const appliedPendingSession = optimistic && !browserSession;
		if (appliedPendingSession) {
			setBrowserSession({
				id: "",
				isPending: true,
				restaurantId: state.restaurant?.id,
				restaurantName: state.restaurant?.displayName,
				status: "syncing",
				tableId: state.table?.id,
				tableName: state.table?.name || state.table?.id || "your table",
			});
		}
		try {
			const result = await withTimeout(
				createBrowserTableSession(token),
				SESSION_JOIN_TIMEOUT_MS,
				"Connecting to this table timed out. Check the connection and try again.",
			);
			if (!result?.session) {
				throw new Error("We could not connect this browser to the table.");
			}
			applySessionResult(result);
		} catch (error) {
			console.error("Create browser table session failed:", error);
			if (appliedPendingSession) setBrowserSession(null);
			setSyncStatus("synced");
			setSessionError(getFriendlySessionError(error));
		} finally {
			setSessionLoading(false);
		}
	};

	useEffect(() => {
		if (
			state.status !== "ready" ||
			!guest?.uid ||
			!authUserId ||
			!token ||
			!orderingEnabled ||
			paymentNotice === "success" ||
			sessionLoading
		) {
			return;
		}

		if (
			!browserSession ||
			browserSession.isPending ||
			!sessionSyncAttemptedRef.current
		) {
			sessionSyncAttemptedRef.current = true;
			handleStartBrowserSession({
				optimistic: !browserSession || browserSession.isPending,
			});
		}
		// This restores the deterministic browser table session after refresh.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		state.status,
		guest?.uid,
		authUserId,
		token,
		orderingEnabled,
		paymentNotice,
		browserSession?.id,
		browserSession?.isPending,
		syncStatus,
	]);

	const handleAddItem = async (menuItem) => {
		if (!isSessionReady || !menuItem?.id || basketBusy) return;

		const busyKey = `add:${menuItem.id}`;
		setBasketBusy(busyKey);
		setSessionError("");
		try {
			const result = await addBrowserBasketItem({
				sessionId: browserSession.id,
				menuItemId: menuItem.id,
				quantity: 1,
				notes: itemNotes[menuItem.id] || "",
			});
			if (result?.basket) applyBasket(result.basket);
			setItemNotes((current) => ({ ...current, [menuItem.id]: "" }));
			setSubmissionResult(null);
		} catch (error) {
			console.error("Add browser basket item failed:", error);
			setSessionError(error.message || "We could not add that item.");
		} finally {
			setBasketBusy("");
		}
	};

	useEffect(() => {
		if (
			importedPublicCartRef.current ||
			!isSessionReady ||
			!state.restaurant?.id ||
			!guest?.uid
		) {
			return;
		}

		const storageKey = `${PUBLIC_RESTAURANT_CART_PREFIX}${state.restaurant.id}`;
		const pendingCart = readJsonCache(storageKey);
		const pendingItems = Array.isArray(pendingCart?.items)
			? pendingCart.items.filter((item) => item?.menuItemId)
			: [];

		if (pendingItems.length === 0) return;

		importedPublicCartRef.current = true;

		const importPendingCart = async () => {
			setBasketBusy("import");
			setSessionError("");
			try {
				let latestBasket = null;
				for (const item of pendingItems) {
					const result = await addBrowserBasketItem({
						sessionId: browserSession.id,
						menuItemId: item.menuItemId,
						quantity: Math.max(1, Number(item.quantity || 1)),
						notes: item.notes || "",
					});
					if (result?.basket) {
						latestBasket = result.basket;
					}
				}
				if (latestBasket) applyBasket(latestBasket);
				removeJsonCache(storageKey);
				setSubmissionResult({
					itemsImported: pendingItems.reduce(
						(total, item) => total + Math.max(1, Number(item.quantity || 1)),
						0,
					),
				});
				window.setTimeout(() => scrollToBasket(), 150);
			} catch (error) {
				console.error("Import public restaurant cart failed:", error);
				importedPublicCartRef.current = false;
				setSessionError(
					error.message ||
						"We could not bring over the basket you built on the restaurant page.",
				);
			} finally {
				setBasketBusy("");
			}
		};

		importPendingCart();
		// This should only run once after the table session is ready.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isSessionReady, state.restaurant?.id, guest?.uid, browserSession?.id]);

	const handleUpdateBasketItem = async (item, nextQuantity) => {
		if (!isSessionReady || !item?.id || basketBusy) return;

		const busyKey = `qty:${item.id}`;
		setBasketBusy(busyKey);
		setSessionError("");
		try {
			const result = await updateBrowserBasketItem({
				sessionId: browserSession.id,
				itemId: item.id,
				quantity: nextQuantity,
			});
			if (result?.basket) applyBasket(result.basket);
			setSubmissionResult(null);
		} catch (error) {
			console.error("Update browser basket item failed:", error);
			setSessionError(error.message || "We could not update that item.");
		} finally {
			setBasketBusy("");
		}
	};

	const handleRemoveBasketItem = async (item) => {
		if (!isSessionReady || !item?.id || basketBusy) return;

		const busyKey = `remove:${item.id}`;
		setBasketBusy(busyKey);
		setSessionError("");
		try {
			const result = await removeBrowserBasketItem({
				sessionId: browserSession.id,
				itemId: item.id,
			});
			if (result?.basket) applyBasket(result.basket);
			setSubmissionResult(null);
		} catch (error) {
			console.error("Remove browser basket item failed:", error);
			setSessionError(error.message || "We could not remove that item.");
		} finally {
			setBasketBusy("");
		}
	};

	const refreshBrowserOrderStatus = async () => {
		if (!isSessionReady || paymentNotice === "success") return;

		try {
			const result = await getBrowserOrderStatus({
				sessionId: browserSession.id,
			});
			if (result?.basket) applyBasket(result.basket);
			if (result?.party) {
				setBrowserSession((current) => {
					if (!current) return current;
					const nextSession = {
						...current,
						guestCount: result.party.guestCount,
						partyMembers: result.party.partyMembers || [],
					};
					if (guest?.uid) {
						cacheBrowserSession({
							token,
							guestId: guest.uid,
							session: nextSession,
							basket: result?.basket || basket,
						});
					}
					return nextSession;
				});
			}
			const nextStatusMap = (result?.items || []).reduce((map, item) => {
				return {
					...map,
					[item.id]: item,
				};
			}, {});
			setOrderStatusByItemId(nextStatusMap);
		} catch (error) {
			console.error("Refresh browser order status failed:", error);
			if (/no longer accepting|expired|voided|closed/i.test(error?.message || "")) {
				applyBasket({
					items: [],
					subtotalCents: 0,
					itemCount: 0,
					status: "closed",
				});
				setOrderStatusByItemId({});
				setSubmissionResult(null);
				setSessionError(getFriendlySessionError(error));
			}
		}
	};

	useEffect(() => {
		setCheckoutStatus(paymentNotice === "success" ? "processing" : "");
	}, [paymentNotice]);

	useEffect(() => {
		if (
			paymentNotice !== "success" ||
			!authUserId ||
			!paymentQuery.orderId
		) {
			return undefined;
		}

		const syncKey = `${paymentQuery.orderId}:${paymentQuery.checkoutSessionId}`;
		if (checkoutSyncAttemptedRef.current === syncKey) return undefined;
		checkoutSyncAttemptedRef.current = syncKey;

		let isMounted = true;
		const markCheckoutPaid = (nextBasket, confirmation = null) => {
			const emptyBasket =
				nextBasket || {
					items: [],
					subtotalCents: 0,
					itemCount: 0,
					status: "empty",
				};
			applyBasket(emptyBasket);
			setOrderStatusByItemId({});
			setSubmissionResult(null);
			setShowSentItems(false);
			setIsCheckoutDrawerOpen(false);
			if (confirmation) setPaidConfirmation(confirmation);
			setCheckoutStatus("paid");
		};

		const syncCheckout = async (attempt = 0) => {
			setCheckoutStatus("processing");
			setSessionError("");
			try {
				const result = await syncBrowserCheckoutSession({
					orderId: paymentQuery.orderId,
					checkoutSessionId: paymentQuery.checkoutSessionId,
					sessionId: browserSession?.id || "",
				});
				if (!isMounted) return;

				if (result?.status === "paid") {
					markCheckoutPaid(result.basket, result.confirmation || null);
					return;
				}

				setCheckoutStatus(result?.status || "processing");
				if (!browserSession?.id) {
					if (attempt < 6) {
						window.setTimeout(() => syncCheckout(attempt + 1), 2000);
					}
					return;
				}
				const statusResult = await getBrowserOrderStatus({
					sessionId: browserSession.id,
				});
				if (!isMounted) return;

				if (statusResult?.basket) {
					applyBasket(statusResult.basket);
					if (
						Number(statusResult.basket.sentItemCount || 0) === 0 &&
						Number(statusResult.basket.itemCount || 0) === 0
					) {
						markCheckoutPaid(statusResult.basket, result?.confirmation || null);
						return;
					}
				}

				if (attempt < 6) {
					window.setTimeout(() => syncCheckout(attempt + 1), 2000);
				}
			} catch (error) {
				console.error("Sync browser checkout session failed:", error);
				if (!isMounted) return;
				setCheckoutStatus("needs_attention");
				setSessionError(
					error.message ||
						"We received the payment return, but could not finalize the order yet.",
				);
				refreshBrowserOrderStatus();
			}
		};

		syncCheckout();
		return () => {
			isMounted = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		paymentNotice,
		paymentQuery.orderId,
		paymentQuery.checkoutSessionId,
		authUserId,
		browserSession?.id,
	]);

	const updateItemRating = (item, patch) => {
		const key = makeRatingKey(item);
		if (!key) return;
		setItemRatings((current) => ({
			...current,
			[key]: {
				ratingValue: 0,
				reviewText: "",
				reviewTags: [],
				submitted: false,
				...(current[key] || {}),
				...patch,
			},
		}));
	};

	const handleSubmitItemRating = async (item) => {
		const key = makeRatingKey(item);
		const ratingState = itemRatings[key] || {};
		if (!paidConfirmation?.restaurantId || !item?.menuItemId || !ratingState.ratingValue) {
			return;
		}

		setRatingBusy(`item:${key}`);
		setRatingNotice("");
		try {
			await submitBrowserMenuItemRating({
				menuItemId: item.menuItemId,
				restaurantId: paidConfirmation.restaurantId,
				ratingValue: Number(ratingState.ratingValue),
				reviewText: ratingState.reviewText || "",
				reviewTags: ratingState.reviewTags || [],
				orderId: paidConfirmation.orderId || paymentQuery.orderId,
				customerName: guest?.firstName || paidConfirmation.customerName || "",
			});
			updateItemRating(item, { submitted: true });
			setRatingNotice("Thanks. Your food rating was saved.");
		} catch (error) {
			console.error("Submit browser food rating failed:", error);
			setRatingNotice(error.message || "We could not save that rating.");
		} finally {
			setRatingBusy("");
		}
	};

	const handleSubmitServerRating = async () => {
		if (!canRateServer || !serverRating.ratingValue) return;

		setRatingBusy("server");
		setRatingNotice("");
		try {
			await submitBrowserServerRating({
				restaurantId: paidConfirmation.restaurantId,
				serverId: paidConfirmation.server.id,
				serverName: paidConfirmation.server.name || "Server",
				ratingValue: Number(serverRating.ratingValue),
				feedbackText: serverRating.feedbackText || "",
				feedbackTags: serverRating.feedbackTags || [],
				orderId: paidConfirmation.orderId || paymentQuery.orderId,
				partyId: paidConfirmation.partyId || browserSession?.partyId || null,
				checkInId: paidConfirmation.checkInId || browserSession?.checkInId || null,
				customerName: guest?.firstName || paidConfirmation.customerName || "",
			});
			setServerRating((current) => ({ ...current, submitted: true }));
			setRatingNotice("Thanks. Your service rating was saved.");
		} catch (error) {
			console.error("Submit browser server rating failed:", error);
			setRatingNotice(error.message || "We could not save that service rating.");
		} finally {
			setRatingBusy("");
		}
	};

	const handleSubmitBasket = async () => {
		if (!isSessionReady || draftItemCount === 0 || basketBusy) return;

		setBasketBusy("submit");
		setSessionError("");
		try {
			const result = await submitBrowserBasketToKitchen({
				sessionId: browserSession.id,
				idempotencyKey: basketFingerprint,
			});
			if (result?.basket) applyBasket(result.basket);
			const nextStatusMap = (result?.items || []).reduce((map, item) => {
				return {
					...map,
					[item.id]: item,
				};
			}, {});
			if (Object.keys(nextStatusMap).length > 0) {
				setOrderStatusByItemId(nextStatusMap);
			}
			setSubmissionResult(result || null);
			setShowSentItems(true);
		} catch (error) {
			console.error("Submit browser basket failed:", error);
			setSessionError(error.message || "We could not send that order.");
		} finally {
			setBasketBusy("");
		}
	};

	const handleStartBrowserCheckout = async () => {
		if (!isSessionReady || sentItemCount === 0 || checkoutBusy || checkoutFinalizing) {
			return;
		}

		setCheckoutBusy(true);
		setSessionError("");
		try {
			const result = await createBrowserCheckoutSession({
				sessionId: browserSession.id,
				token,
				gratuity: browserGratuityCents,
				returnUrl: `${window.location.origin}${window.location.pathname}`,
			});

			if (!result?.checkoutUrl) {
				throw new Error("Secure checkout is not available yet.");
			}

			window.location.assign(result.checkoutUrl);
		} catch (error) {
			console.error("Create browser checkout session failed:", error);
			setSessionError(error.message || "We could not start secure checkout.");
		} finally {
			setCheckoutBusy(false);
		}
	};

	useEffect(() => {
		if (!browserSession?.id || paymentNotice === "success") return undefined;

		refreshBrowserOrderStatus();
		const intervalId = window.setInterval(refreshBrowserOrderStatus, 6000);
		return () => window.clearInterval(intervalId);
		// Polling should restart when the session or sent count changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [browserSession?.id, paymentNotice, sentItemCount]);

	const handleClosePaidWindow = () => {
		setCloseWindowNotice("");
		window.close();
		window.setTimeout(() => {
			setCloseWindowNotice("You can safely close this browser window.");
		}, 250);
	};

	const renderPaidReceipt = () => {
		if (!paidConfirmation) return null;

		const subtotalCents = Number(paidConfirmation.subtotal || 0);
		const taxCents = Number(paidConfirmation.taxAmount || 0);
		const gratuityCents = Number(paidConfirmation.gratuity || 0);
		const serviceFeeCents = Number(paidConfirmation.platformFee || 0);
		const totalCents = Number(paidConfirmation.total || 0);

		return (
			<ReceiptPanel aria-label="Order receipt">
				<ReceiptStatus>
					<span>Card payment complete</span>
					<span>{formatCents(totalCents)}</span>
				</ReceiptStatus>
				<TotalsLine>
					<span>Order</span>
					<ReceiptOrderValue>{paidConfirmation.orderId}</ReceiptOrderValue>
				</TotalsLine>
				{paidConfirmationItems.length > 0 ? (
					<ReceiptItems>
						{paidConfirmationItems.map((item, index) => {
							const itemKey = `${item.menuItemId || item.name || "item"}-${index}`;
							const quantity = Math.max(1, Number(item.quantity || 1));
							const unitPriceCents = Number(item.priceCents || 0);
							const lineTotalCents =
								Number(item.lineTotalCents || 0) || unitPriceCents * quantity;

							return (
								<ReceiptItemRow key={itemKey}>
									<ReceiptItemMeta>
										<ReceiptItemName>{item.name || "Menu item"}</ReceiptItemName>
										<ReceiptItemDetail>
											Qty {quantity}
											{unitPriceCents > 0
												? ` at ${formatCents(unitPriceCents)}`
												: ""}
										</ReceiptItemDetail>
									</ReceiptItemMeta>
									<ReceiptItemAmount>
										{formatCents(lineTotalCents)}
									</ReceiptItemAmount>
								</ReceiptItemRow>
							);
						})}
					</ReceiptItems>
				) : (
					<EmptyBasket>
						Item details are being finalized. Your payment is complete.
					</EmptyBasket>
				)}
				<ReceiptTotals>
					<TotalsLine>
						<span>Subtotal</span>
						<span>{formatCents(subtotalCents)}</span>
					</TotalsLine>
					{taxCents > 0 ? (
						<TotalsLine>
							<span>Tax</span>
							<span>{formatCents(taxCents)}</span>
						</TotalsLine>
					) : null}
					{gratuityCents > 0 ? (
						<TotalsLine>
							<span>Tip</span>
							<span>{formatCents(gratuityCents)}</span>
						</TotalsLine>
					) : null}
					{serviceFeeCents > 0 ? (
						<TotalsLine>
							<span>Service fee</span>
							<span>{formatCents(serviceFeeCents)}</span>
						</TotalsLine>
					) : null}
					<TotalsLineStrong>
						<span>Total paid</span>
						<span>{formatCents(totalCents)}</span>
					</TotalsLineStrong>
				</ReceiptTotals>
			</ReceiptPanel>
		);
	};

	const renderPaidRatings = () => {
		if (checkoutStatus !== "paid" || !paidConfirmation) {
			return (
				<ConfirmationPanel>
					<ConfirmationHeader>
						<ConfirmationTitle>Payment received</ConfirmationTitle>
						<SectionHint>
							We are confirming the order and preparing your receipt. This usually
							takes a moment.
						</SectionHint>
					</ConfirmationHeader>
					<LoadingText>Finalizing your order...</LoadingText>
				</ConfirmationPanel>
			);
		}

		return (
			<ConfirmationPanel>
				<ConfirmationHeader>
					<ConfirmationTitle>Order confirmed</ConfirmationTitle>
					<SectionHint>
						{paidConfirmationItems.length > 0
							? "Review your receipt, then rate what you ordered while it is still fresh."
							: "Your payment is complete."}
					</SectionHint>
				</ConfirmationHeader>
				{renderPaidReceipt()}
				{paidConfirmationItems.length > 0 ? (
					<RatingList>
						{paidConfirmationItems.map((item) => {
							const key = makeRatingKey(item);
							const ratingState = itemRatings[key] || {};
							const submitted = ratingState.submitted === true;

							return (
								<RatingCard key={key}>
									<RatingCardTop>
										<div>
											<BasketName>{item.name}</BasketName>
											<BasketMeta>
												Qty {item.quantity} - {formatCents(item.lineTotalCents)}
											</BasketMeta>
										</div>
										{submitted ? <SentChip>Rated</SentChip> : null}
									</RatingCardTop>
									<StarRatingControl
										disabled={submitted}
										label={`Rate ${item.name}`}
										onChange={(ratingValue) =>
											updateItemRating(item, { ratingValue })
										}
										value={ratingState.ratingValue || 0}
									/>
									<TagRow>
										{FOOD_REVIEW_TAGS.map((tag) => {
											const active = (ratingState.reviewTags || []).includes(tag);
											return (
												<ReviewTagButton
													$active={active}
													disabled={submitted}
													key={tag}
													onClick={() =>
														updateItemRating(item, {
															reviewTags: toggleListValue(
																ratingState.reviewTags || [],
																tag,
															),
														})
													}
													type="button"
												>
													{tag}
												</ReviewTagButton>
											);
										})}
									</TagRow>
									<ReviewInput
										disabled={submitted}
										onChange={(event) =>
											updateItemRating(item, {
												reviewText: event.target.value.slice(0, 800),
											})
										}
										placeholder="Optional note"
										value={ratingState.reviewText || ""}
									/>
									<RatingSubmitButton
										disabled={
											submitted ||
											!ratingState.ratingValue ||
											ratingBusy === `item:${key}`
										}
										onClick={() => handleSubmitItemRating(item)}
										type="button"
									>
										{ratingBusy === `item:${key}` ? "Saving..." : "Save rating"}
									</RatingSubmitButton>
								</RatingCard>
							);
						})}
					</RatingList>
				) : null}
				{canRateServer ? (
					<RatingCard>
						<RatingCardTop>
							<div>
								<BasketName>Service from {paidConfirmation.server.name}</BasketName>
								<BasketMeta>Private feedback for the restaurant</BasketMeta>
							</div>
							{serverRating.submitted ? <SentChip>Rated</SentChip> : null}
						</RatingCardTop>
						<StarRatingControl
							disabled={serverRating.submitted}
							label={`Rate ${paidConfirmation.server.name}`}
							onChange={(ratingValue) =>
								setServerRating((current) => ({
									...current,
									ratingValue,
								}))
							}
							value={serverRating.ratingValue}
						/>
						<TagRow>
							{SERVER_REVIEW_TAGS.map((tag) => {
								const active = serverRating.feedbackTags.includes(tag);
								return (
									<ReviewTagButton
										$active={active}
										disabled={serverRating.submitted}
										key={tag}
										onClick={() =>
											setServerRating((current) => ({
												...current,
												feedbackTags: toggleListValue(
													current.feedbackTags,
													tag,
												),
											}))
										}
										type="button"
									>
										{tag}
									</ReviewTagButton>
								);
							})}
						</TagRow>
						<ReviewInput
							disabled={serverRating.submitted}
							onChange={(event) =>
								setServerRating((current) => ({
									...current,
									feedbackText: event.target.value.slice(0, 600),
								}))
							}
							placeholder="Optional service note"
							value={serverRating.feedbackText}
						/>
						<RatingSubmitButton
							disabled={
								serverRating.submitted ||
								!serverRating.ratingValue ||
								ratingBusy === "server"
							}
							onClick={handleSubmitServerRating}
							type="button"
						>
							{ratingBusy === "server" ? "Saving..." : "Save service rating"}
						</RatingSubmitButton>
					</RatingCard>
				) : null}
				{ratingNotice ? <BasketMeta>{ratingNotice}</BasketMeta> : null}
			</ConfirmationPanel>
		);
	};

	if (state.status === "loading") {
		return (
			<Page>
				<Panel>
					<Eyebrow>Scerv table</Eyebrow>
					<Title>Opening your table</Title>
					<LoadingText>Checking this table QR code...</LoadingText>
				</Panel>
			</Page>
		);
	}

	if (state.status === "ready") {
		const restaurantPath = `/r/${state.restaurant.slug}`;

		if (paymentNotice === "success") {
			return (
				<Page>
					<Helmet>
						<title>Order Confirmation | Scerv</title>
					</Helmet>
					<Panel $wide>
						<TopBar>
							<BrandMark>Scerv receipt</BrandMark>
							{guest?.uid ? (
								<GuestBadge title={guest.email || guest.firstName || "Guest"}>
									<span>{String(guest.firstName || "G").slice(0, 1)}</span>
									<span>{guest.firstName || "Guest"}</span>
								</GuestBadge>
							) : null}
						</TopBar>
						<PaidPageHeader>
							<PaidPageTitle>
								{checkoutStatus === "paid" ? "You're all set." : "Payment received."}
							</PaidPageTitle>
							<PaidPageText>
								{checkoutStatus === "paid"
									? `Thanks for dining at ${state.restaurant.displayName}. Your table has been sent to the restaurant team for closeout.`
									: `Thanks for dining at ${state.restaurant.displayName}. We are finalizing your receipt now.`}
							</PaidPageText>
						</PaidPageHeader>
						<AppDownloadPanel>
							<ConfirmationHeader>
								<ConfirmationTitle>Keep your Scerv history</ConfirmationTitle>
								<SectionHint>
									Download the app to keep receipts, rewards, favorites, and
									future reservations in one place.
								</SectionHint>
							</ConfirmationHeader>
							<AppDownloadActions>
								<StoreLinkButton
									href={SCERV_IOS_APP_URL}
									rel="noreferrer"
									target="_blank"
								>
									iPhone app
								</StoreLinkButton>
								<StoreLinkButton
									href={SCERV_ANDROID_APP_URL}
									rel="noreferrer"
									target="_blank"
								>
									Android app
								</StoreLinkButton>
							</AppDownloadActions>
						</AppDownloadPanel>
						{renderPaidRatings()}
						<ConfirmationActions>
							<CloseWindowButton onClick={handleClosePaidWindow} type="button">
								Close this window
							</CloseWindowButton>
							<SecondaryAction to={restaurantPath}>
								View restaurant page
							</SecondaryAction>
							{closeWindowNotice ? (
								<BasketMeta>{closeWindowNotice}</BasketMeta>
							) : null}
						</ConfirmationActions>
					</Panel>
				</Page>
			);
		}

		return (
			<Page $hasBasket={Boolean(browserSession && basket.itemCount > 0)}>
				<Helmet>
					<title>{state.restaurant.displayName} Table | Scerv</title>
				</Helmet>
				<Panel $wide={Boolean(browserSession)}>
					<TopBar>
						<BrandMark>Scerv table</BrandMark>
						{guest?.uid ? (
							<GuestBadge title={guest.email || guest.firstName || "Guest"}>
								<span>{String(guest.firstName || "G").slice(0, 1)}</span>
								<span>{guest.firstName || "Guest"}</span>
							</GuestBadge>
						) : null}
					</TopBar>
					<Title>{state.restaurant.displayName}</Title>
					<Body>
						{orderingEnabled
							? "Browse the menu and build your basket from this table."
							: "This restaurant page is available for browsing. Browser ordering is not enabled for this table yet."}
					</Body>
					<MetaRail aria-label="Table details">
						<MetaChip title="Table">
							<span aria-hidden="true">T</span>
							{state.table?.name || state.table?.id || "Table"}
						</MetaChip>
						<MetaChip title="Menu item count">
							<span aria-hidden="true">M</span>
							{state.menuCount} items
						</MetaChip>
						<MetaChip title="Table status">
							<span aria-hidden="true">S</span>
							{state.table?.status || "available"}
						</MetaChip>
					</MetaRail>
					{paymentNotice === "success" ? (
						<NoticeText $tone="success">
							{checkoutStatus === "paid"
								? "Payment complete. You're all set."
								: "Payment received. We are finalizing your order now."}
						</NoticeText>
					) : null}
					{paymentNotice === "cancelled" ? (
						<NoticeText $tone="warning">
							Checkout was cancelled. No card payment was completed.
						</NoticeText>
					) : null}
					{checkoutStatus === "paid" && paidConfirmation ? (
						<ConfirmationPanel>
							<ConfirmationHeader>
								<ConfirmationTitle>Order confirmed</ConfirmationTitle>
								<SectionHint>
									{paidConfirmationItems.length > 0
										? "Rate what you ordered while it is still fresh."
										: "Your payment is complete."}
								</SectionHint>
							</ConfirmationHeader>
							<TotalsLine>
								<span>Order</span>
								<span>{paidConfirmation.orderId}</span>
							</TotalsLine>
							<TotalsLine>
								<span>Total paid</span>
								<span>{formatCents(paidConfirmation.total)}</span>
							</TotalsLine>
							{paidConfirmationItems.length > 0 ? (
								<RatingList>
									{paidConfirmationItems.map((item) => {
										const key = makeRatingKey(item);
										const ratingState = itemRatings[key] || {};
										const submitted = ratingState.submitted === true;

										return (
											<RatingCard key={key}>
												<RatingCardTop>
													<div>
														<BasketName>{item.name}</BasketName>
														<BasketMeta>
															Qty {item.quantity} - {formatCents(item.lineTotalCents)}
														</BasketMeta>
													</div>
													{submitted ? <SentChip>Rated</SentChip> : null}
												</RatingCardTop>
												<StarRatingControl
													disabled={submitted}
													label={`Rate ${item.name}`}
													onChange={(ratingValue) =>
														updateItemRating(item, { ratingValue })
													}
													value={ratingState.ratingValue || 0}
												/>
												<TagRow>
													{FOOD_REVIEW_TAGS.map((tag) => {
														const active = (ratingState.reviewTags || []).includes(tag);
														return (
															<ReviewTagButton
																$active={active}
																disabled={submitted}
																key={tag}
																onClick={() =>
																	updateItemRating(item, {
																		reviewTags: toggleListValue(
																			ratingState.reviewTags || [],
																			tag,
																		),
																	})
																}
																type="button"
															>
																{tag}
															</ReviewTagButton>
														);
													})}
												</TagRow>
												<ReviewInput
													disabled={submitted}
													onChange={(event) =>
														updateItemRating(item, {
															reviewText: event.target.value.slice(0, 800),
														})
													}
													placeholder="Optional note"
													value={ratingState.reviewText || ""}
												/>
												<RatingSubmitButton
													disabled={
														submitted ||
														!ratingState.ratingValue ||
														ratingBusy === `item:${key}`
													}
													onClick={() => handleSubmitItemRating(item)}
													type="button"
												>
													{ratingBusy === `item:${key}` ? "Saving..." : "Save rating"}
												</RatingSubmitButton>
											</RatingCard>
										);
									})}
								</RatingList>
							) : null}
							{canRateServer ? (
								<RatingCard>
									<RatingCardTop>
										<div>
											<BasketName>Service from {paidConfirmation.server.name}</BasketName>
											<BasketMeta>Private feedback for the restaurant</BasketMeta>
										</div>
										{serverRating.submitted ? <SentChip>Rated</SentChip> : null}
									</RatingCardTop>
									<StarRatingControl
										disabled={serverRating.submitted}
										label={`Rate ${paidConfirmation.server.name}`}
										onChange={(ratingValue) =>
											setServerRating((current) => ({
												...current,
												ratingValue,
											}))
										}
										value={serverRating.ratingValue}
									/>
									<TagRow>
										{SERVER_REVIEW_TAGS.map((tag) => {
											const active = serverRating.feedbackTags.includes(tag);
											return (
												<ReviewTagButton
													$active={active}
													disabled={serverRating.submitted}
													key={tag}
													onClick={() =>
														setServerRating((current) => ({
															...current,
															feedbackTags: toggleListValue(
																current.feedbackTags,
																tag,
															),
														}))
													}
													type="button"
												>
													{tag}
												</ReviewTagButton>
											);
										})}
									</TagRow>
									<ReviewInput
										disabled={serverRating.submitted}
										onChange={(event) =>
											setServerRating((current) => ({
												...current,
												feedbackText: event.target.value.slice(0, 600),
											}))
										}
										placeholder="Optional service note"
										value={serverRating.feedbackText}
									/>
									<RatingSubmitButton
										disabled={
											serverRating.submitted ||
											!serverRating.ratingValue ||
											ratingBusy === "server"
										}
										onClick={handleSubmitServerRating}
										type="button"
									>
										{ratingBusy === "server" ? "Saving..." : "Save service rating"}
									</RatingSubmitButton>
								</RatingCard>
							) : null}
							{ratingNotice ? <BasketMeta>{ratingNotice}</BasketMeta> : null}
						</ConfirmationPanel>
					) : null}
					{!guest?.uid ? (
						<BrowserGuestIdentity
							onVerified={(verifiedGuest) => {
								setGuest(verifiedGuest);
								setSessionError("");
							}}
							restaurantId={state.restaurant.id}
							tableId={state.table?.id}
						/>
					) : null}
					{browserSession ? (
						<>
							<CompactSessionBar>
								<SessionSummary>
									{browserSession.isPending
										? "Opening this table..."
										: `${tableGuestCount > 1 ? `${tableGuestCount} guests` : "Joined"} at ${
												browserSession.tableName || "your table"
											}`}
								</SessionSummary>
								<SessionActions>
									<SyncChip $status={syncStatus}>
										{syncStatus === "syncing" ? "Syncing" : "Ready"}
									</SyncChip>
									<ShareTableButton
										aria-label="Share this table link"
										onClick={handleShareTableLink}
										title="Share this table"
										type="button"
									>
										Share
									</ShareTableButton>
									<InfoButton
										aria-expanded={showSessionDetails}
										aria-label="Show table session details"
										onClick={() => setShowSessionDetails((current) => !current)}
										title="Table session details"
										type="button"
									>
										i
									</InfoButton>
								</SessionActions>
							</CompactSessionBar>
							{shareNotice ? (
								<NoticeText $tone="success">{shareNotice}</NoticeText>
							) : null}
							{tablePartyMembers.length > 0 ? (
								<PartyMemberRail aria-label="Guests joined at this table">
									{tablePartyMembers.slice(0, 6).map((member) => (
										<PartyMemberChip key={member.userId}>
											{member.userId === guest?.uid
												? "You"
												: member.name || "Guest"}
										</PartyMemberChip>
									))}
									{tableGuestCount > tablePartyMembers.length ? (
										<PartyMemberChip>
											+{tableGuestCount - tablePartyMembers.length} more
										</PartyMemberChip>
									) : null}
								</PartyMemberRail>
							) : null}
							{showSessionDetails ? (
								<SessionDetails>
									<div>Restaurant: {browserSession.restaurantName}</div>
									<div>Table: {browserSession.tableName}</div>
									<div>
										Party: {tableGuestCount}{" "}
										{tableGuestCount === 1 ? "guest" : "guests"} connected
									</div>
									<div>
										Prices and availability come directly from the restaurant
										menu before anything reaches the kitchen.
									</div>
								</SessionDetails>
							) : null}
						</>
					) : null}
					{browserSession ? (
						<BasketShell>
							<MenuSection>
								<SectionHeader>
									<div>
										<SectionTitle>Menu</SectionTitle>
										<SectionHint>
											Add what you want. You can review before sending.
										</SectionHint>
									</div>
								</SectionHeader>
								{Object.entries(menuGroups).map(([category, items]) => (
									<CategoryBlock key={category}>
										<CategoryTitle>{category}</CategoryTitle>
										{items.map((item) => (
											<MenuItemCard key={item.id}>
												<MenuThumb
													$image={
														item.imageUrl ||
														item.imageUri ||
														state.restaurant.imageUrl ||
														"/logo512.png"
													}
												/>
												<MenuItemBody>
													<MenuItemTop>
														<ItemName>{item.name || "Menu item"}</ItemName>
														<ItemPrice>{formatPrice(item.price)}</ItemPrice>
													</MenuItemTop>
													<ItemStatusRow>
														{basketQuantityByMenuItem[item.id] ? (
															<AddedChip>
																{basketQuantityByMenuItem[item.id]} added
															</AddedChip>
														) : null}
													</ItemStatusRow>
													{item.description ? (
														<ItemDescription>{item.description}</ItemDescription>
													) : null}
													<ItemActions>
														<NoteInput
															aria-label={`Notes for ${item.name || "menu item"}`}
															onChange={(event) =>
																setItemNotes((current) => ({
																	...current,
																	[item.id]: event.target.value,
																}))
															}
															placeholder="Notes"
															value={itemNotes[item.id] || ""}
														/>
														<AddButton
															disabled={
																!isSessionReady || basketBusy === `add:${item.id}`
															}
															onClick={() => handleAddItem(item)}
															type="button"
														>
															{basketBusy === `add:${item.id}`
																? "Adding"
																: isSessionReady
																	? "+ Add"
																	: "Opening"}
														</AddButton>
													</ItemActions>
												</MenuItemBody>
											</MenuItemCard>
										))}
									</CategoryBlock>
								))}
							</MenuSection>
							<BasketPanel ref={basketPanelRef}>
								<SectionHeader>
									<div>
										<SectionTitle>Basket</SectionTitle>
										<SectionHint>
											{draftItemCount > 0
												? `${draftItemCount} ready to send`
												: sentBasketItems.length > 0
													? "Order sent"
													: "0 items"}
										</SectionHint>
									</div>
								</SectionHeader>
								{draftBasketItems.length === 0 ? (
									<EmptyBasket>
										{sentItemCount > 0
											? "Add more items to start another round."
											: "Your basket is empty. Add a few items from the menu to build the order."}
									</EmptyBasket>
								) : (
									draftBasketItems.map((item) => (
										<BasketItem key={item.id}>
											<BasketItemTop>
												<BasketName>{item.name}</BasketName>
												<div>
													<strong>{formatCents(item.lineTotalCents)}</strong>
												</div>
											</BasketItemTop>
											{item.notes ? (
												<BasketMeta>Note: {item.notes}</BasketMeta>
											) : null}
											<QuantityRow>
												<QuantityControls>
													<QuantityButton
														disabled={basketBusy === `qty:${item.id}`}
														onClick={() =>
															handleUpdateBasketItem(item, item.quantity - 1)
														}
														type="button"
													>
														-
													</QuantityButton>
													<strong>{item.quantity}</strong>
													<QuantityButton
														disabled={basketBusy === `qty:${item.id}`}
														onClick={() =>
															handleUpdateBasketItem(item, item.quantity + 1)
														}
														type="button"
													>
														+
													</QuantityButton>
												</QuantityControls>
												<RemoveButton
													disabled={basketBusy === `remove:${item.id}`}
													onClick={() => handleRemoveBasketItem(item)}
													type="button"
												>
													Remove
												</RemoveButton>
											</QuantityRow>
										</BasketItem>
									))
								)}
								{sentItemCount > 0 ? (
									<>
										<SentSummaryButton
											aria-expanded={showSentItems}
											onClick={() => setShowSentItems((current) => !current)}
											type="button"
										>
											<div>
												Sent to kitchen
												<BasketMeta>
													{sentItemCount} items
												</BasketMeta>
											</div>
											<span>{showSentItems ? "Hide" : "View"}</span>
										</SentSummaryButton>
										{showSentItems ? (
											<SentItemsList>
												{sentBasketItems.map((item) => {
													const liveStatus =
														orderStatusByItemId[item.id] ||
														getFallbackSentStatus(item);

													return (
														<SentItemRow key={item.id}>
															<div>
																<BasketName>{item.name}</BasketName>
																<BasketMeta>
																	Qty {item.quantity}
																	{item.orderedByPipName || item.addedByName
																		? ` - ${
																				item.orderedByPipName ||
																				item.addedByName
																			}`
																		: ""}
																</BasketMeta>
																<StatusChip $tone={liveStatus.tone}>
																	{liveStatus.label}
																</StatusChip>
															</div>
															<div>
																<strong>{formatCents(item.lineTotalCents)}</strong>
																<SentChip>Sent</SentChip>
															</div>
														</SentItemRow>
													);
												})}
											</SentItemsList>
										) : null}
									</>
								) : null}
								{submissionResult?.itemsSent ? (
									<EmptyBasket>
										Sent to the restaurant. You can add more items and send
										another round.
									</EmptyBasket>
								) : null}
								{submissionResult?.itemsImported ? (
									<EmptyBasket>
										We brought over {submissionResult.itemsImported} items from the
										restaurant page. Review them, then send when ready.
									</EmptyBasket>
								) : null}
								{checkoutFinalizing && sentItemCount > 0 ? (
									<EmptyBasket>
										{checkoutStatus === "paid"
											? "Payment complete. We cleared the paid items from your table."
											: "Payment is being finalized. This usually takes a few seconds."}
									</EmptyBasket>
								) : null}
								{showCheckoutControls ? (
									<TipControl>
										<TipHeader>
											<span>Tip</span>
											<span>{formatCents(browserGratuityCents)}</span>
										</TipHeader>
										<TipOptions aria-label="Choose tip">
											{[
												{ label: "Cash tip", value: "cash" },
												{ label: "15%", value: "15" },
												{ label: "18%", value: "18" },
												{ label: "20%", value: "20" },
												{ label: "Custom", value: "custom" },
											].map((option) => (
												<TipButton
													$active={tipChoice === option.value}
													key={option.value}
													onClick={() => setTipChoice(option.value)}
													type="button"
												>
													{option.label}
												</TipButton>
											))}
										</TipOptions>
										{tipChoice === "custom" ? (
											<CustomTipInput
												inputMode="decimal"
												onChange={(event) =>
													setCustomTipValue(
														event.target.value
															.replace(/[^0-9.]/g, "")
															.replace(/(\..*)\./g, "$1")
															.slice(0, 8),
													)
												}
												placeholder="Custom tip"
												value={customTipValue}
											/>
										) : null}
										<TotalsLine>
											<span>Subtotal</span>
											<span>{formatCents(sentSubtotalCents)}</span>
										</TotalsLine>
										<TotalsLine>
											<span>Tip</span>
											<span>
												{tipChoice === "cash"
													? "Cash at table"
													: formatCents(browserGratuityCents)}
											</span>
										</TotalsLine>
										<TotalsLine>
											<span>{formatTaxLabel(browserTaxRate)}</span>
											<span>{formatCents(browserEstimatedTaxCents)}</span>
										</TotalsLine>
										<TotalsLineStrong>
											<span>Estimated total</span>
											<span>{formatCents(browserEstimatedBeforeServiceCents)}</span>
										</TotalsLineStrong>
										<EmptyBasket>
											Service fee is confirmed during secure checkout.
										</EmptyBasket>
										{sessionError ? <ErrorText>{sessionError}</ErrorText> : null}
										<DisabledCheckout
											disabled={!isSessionReady || checkoutBusy}
											onClick={handleStartBrowserCheckout}
											type="button"
										>
											{checkoutBusy ? "Opening checkout..." : "Pay with card"}
										</DisabledCheckout>
									</TipControl>
								) : null}
								{draftItemCount > 0 ? (
									<BasketTotal>
										<span>Ready to send</span>
										<span>{formatCents(draftSubtotalCents)}</span>
									</BasketTotal>
								) : null}
								<DisabledCheckout
									disabled={
										!isSessionReady ||
										draftItemCount === 0 ||
										basketBusy === "submit"
									}
									onClick={handleSubmitBasket}
									type="button"
								>
									{basketBusy === "submit"
										? "Sending..."
										: !isSessionReady
											? "Opening table..."
											: draftItemCount > 0
											? "Send order"
											: "Add items to send"}
								</DisabledCheckout>
							</BasketPanel>
						</BasketShell>
					) : null}
					{!browserSession ? (
						<ActionStack>
							<PrimaryAction to={restaurantPath}>View menu</PrimaryAction>
							<PrimaryButton
								disabled={
									!guest?.uid ||
									!authUserId ||
									sessionLoading ||
									!orderingEnabled
								}
								onClick={handleStartBrowserSession}
								type="button"
							>
								{sessionLoading ? "Connecting..." : "Join table"}
							</PrimaryButton>
							{sessionError ? <ErrorText>{sessionError}</ErrorText> : null}
							<SecondaryAction to="/">Go to Scerv</SecondaryAction>
						</ActionStack>
					) : (
						(sessionError ? <ErrorText>{sessionError}</ErrorText> : null)
					)}
					{showStickyBasket ? (
						<StickyBasketBar $expanded={isCheckoutDrawerOpen}>
							<StickyBasketTop>
								<StickyBasketSummary>
									<strong>
										{checkoutFinalizing
											? checkoutStatus === "paid"
												? "Payment complete"
												: "Finalizing payment"
											: draftItemCount > 0
												? `${draftItemCount} ready to send`
												: `${sentItemCount} sent to kitchen`}
									</strong>
									<span>
										{checkoutFinalizing
											? "Receipt coming shortly"
											: draftItemCount > 0
												? formatCents(draftSubtotalCents)
												: `Subtotal ${formatCents(sentSubtotalCents)}`}
									</span>
								</StickyBasketSummary>
								<StickyBasketButton
									onClick={() => {
										if (checkoutFinalizing) {
											scrollToBasket();
											return;
										}
										if (draftItemCount === 0 && showCheckoutControls) {
											setIsCheckoutDrawerOpen((current) => !current);
											return;
										}
										scrollToBasket();
									}}
									type="button"
								>
									{checkoutFinalizing
										? "Status"
										: draftItemCount === 0 && showCheckoutControls
										? isCheckoutDrawerOpen
											? "Close"
											: "Totals"
										: "Review"}
								</StickyBasketButton>
							</StickyBasketTop>
							{draftItemCount === 0 && showCheckoutControls && isCheckoutDrawerOpen ? (
								<StickyTotalsDrawer>
									<TipOptions aria-label="Choose tip from checkout bar">
										{[
											{ label: "Cash tip", value: "cash" },
											{ label: "15%", value: "15" },
											{ label: "18%", value: "18" },
											{ label: "20%", value: "20" },
											{ label: "Custom", value: "custom" },
										].map((option) => (
											<TipButton
												$active={tipChoice === option.value}
												key={option.value}
												onClick={() => setTipChoice(option.value)}
												type="button"
											>
												{option.label}
											</TipButton>
										))}
									</TipOptions>
									{tipChoice === "custom" ? (
										<CustomTipInput
											inputMode="decimal"
											onChange={(event) =>
												setCustomTipValue(
													event.target.value
														.replace(/[^0-9.]/g, "")
														.replace(/(\..*)\./g, "$1")
														.slice(0, 8),
												)
											}
											placeholder="Custom tip"
											value={customTipValue}
										/>
									) : null}
									<TotalsLine>
										<span>Subtotal</span>
										<span>{formatCents(sentSubtotalCents)}</span>
									</TotalsLine>
									<TotalsLine>
										<span>Tip</span>
										<span>
											{tipChoice === "cash"
												? "Cash at table"
												: formatCents(browserGratuityCents)}
										</span>
									</TotalsLine>
									<TotalsLine>
										<span>{formatTaxLabel(browserTaxRate)}</span>
										<span>{formatCents(browserEstimatedTaxCents)}</span>
									</TotalsLine>
									<TotalsLineStrong>
										<span>Estimated total</span>
										<span>{formatCents(browserEstimatedBeforeServiceCents)}</span>
									</TotalsLineStrong>
									{sessionError ? <ErrorText>{sessionError}</ErrorText> : null}
									<DisabledCheckout
										disabled={!isSessionReady || checkoutBusy}
										onClick={handleStartBrowserCheckout}
										type="button"
									>
										{checkoutBusy ? "Opening checkout..." : "Pay with card"}
									</DisabledCheckout>
								</StickyTotalsDrawer>
							) : null}
						</StickyBasketBar>
					) : null}
				</Panel>
			</Page>
		);
	}

	return (
		<Page>
			<Helmet>
				<title>Open Scerv Dining | Scerv</title>
			</Helmet>
			<Panel>
				<Eyebrow>Scerv dining</Eyebrow>
				<Title>
					{state.status === "manual"
						? "Scan a table QR"
						: "This table link is not active"}
				</Title>
				<Body>
					{state.status === "manual"
						? "Use the QR code at a participating restaurant table to open the menu and dining session in your browser."
						: "Ask the restaurant team for a fresh QR code or browse Scerv from the homepage."}
				</Body>
				<ActionStack>
					<PrimaryAction to="/">Go to Scerv</PrimaryAction>
				</ActionStack>
			</Panel>
		</Page>
	);
};

export default ScanRedirect;
