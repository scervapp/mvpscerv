// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Opt-out of package.json exports support as per SDK 53 known issues with Firebase
config.resolver.unstable_enablePackageExports = false;
// You might also need this for symlinks if using a monorepo or linked packages
// config.resolver.unstable_enableSymlinks = true;

module.exports = config;
