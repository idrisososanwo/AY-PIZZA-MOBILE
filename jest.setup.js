/* eslint-env jest */
jest.setTimeout(30000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// In-memory mock for expo-secure-store in test environments
const secureStoreState = {};
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key, value) => {
    secureStoreState[key] = String(value);
  }),
  getItemAsync: jest.fn(async (key) => {
    return secureStoreState[key] !== undefined ? secureStoreState[key] : null;
  }),
  deleteItemAsync: jest.fn(async (key) => {
    delete secureStoreState[key];
  }),
  isAvailableAsync: jest.fn(async () => true),
  __resetMock: () => {
    for (const k of Object.keys(secureStoreState)) {
      delete secureStoreState[k];
    }
  },
}));

// In-memory mock for expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[mock-test-token-123]' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { MAX: 5 },
}));

// Mock for expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

// Mock for expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Mock for react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 44, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((dict) => dict.android || dict.default),
  },
  StyleSheet: {
    create: (styles) => styles,
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  TextInput: 'TextInput',
}));


