/**
 * Jest configuration for Uptime Pocket.
 *
 * We use `jest-expo` which is the Expo-blessed preset for testing Expo /
 * React Native code. It handles all the painful parts of mocking
 * `react-native`, `expo-*`, and friends.
 *
 * See: https://docs.expo.dev/guides/testing/
 */

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-native-community|expo-modules-core|expo-secure-store)',
  ],
  // Silence the noisy stack trace when a test fails; we get enough info
  // from the assertion message + file/line.
  verbose: true,
};
