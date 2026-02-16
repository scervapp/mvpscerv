import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

const CustomerProfile = () => {
  const { t } = useTranslation();
  return (
    <View>
      <Text>{t("customer_profile")}</Text>
    </View>
  );
};

export default CustomerProfile;
