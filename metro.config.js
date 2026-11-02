// Metro, as Expo sets it up, plus one file type.
//
// `wasm` is for the web preview only (0.4.0, part 7): expo-sqlite's web build
// runs SQLite as WebAssembly, and Metro has to be told to serve the .wasm file
// as an asset. An Android bundle has no .wasm in it; this changes nothing there.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
