const normalizeInviteCode = (value) =>
	typeof value === "string" ? value.trim().toUpperCase() : "";

const listIncludes = (list, value) => Array.isArray(list) && list.includes(value);

const isPartyMember = (partyData = {}, uid) => {
	if (!uid) return false;

	return (
		partyData.hostUserId === uid ||
		partyData.hostId === uid ||
		listIncludes(partyData.guestUserIds, uid) ||
		listIncludes(partyData.memberUids, uid) ||
		(partyData.guestPips || []).some((pip) => pip && pip.userId === uid)
	);
};

const canUseDirectPartyIdJoin = ({ partyData, uid }) =>
	isPartyMember(partyData, uid);

module.exports = {
	canUseDirectPartyIdJoin,
	isPartyMember,
	normalizeInviteCode,
};
