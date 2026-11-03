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
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(async () => false),
  },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Animated: {
    Value: jest.fn((val) => ({
      interpolate: jest.fn(),
      setValue: jest.fn(),
      _value: val,
    })),
    timing: jest.fn(() => ({
      start: (cb) => cb && cb({ finished: true }),
    })),
    parallel: jest.fn(() => ({
      start: (cb) => cb && cb({ finished: true }),
    })),
    sequence: jest.fn(() => ({
      start: (cb) => cb && cb({ finished: true }),
    })),
    delay: jest.fn(() => ({
      start: (cb) => cb && cb({ finished: true }),
    })),
    loop: jest.fn(() => ({
      start: (cb) => cb && cb({ finished: true }),
      stop: jest.fn(),
    })),
    View: 'Animated.View',
    Image: 'Animated.Image',
    Text: 'Animated.Text',
  },
  Easing: {
    out: jest.fn((e) => e),
    inOut: jest.fn((e) => e),
    quad: jest.fn(),
    cubic: jest.fn(),
    bezier: jest.fn(),
  },
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  TextInput: 'TextInput',
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock for react-native-svg
jest.mock('react-native-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const createMockComponent = (name) => {
    const Component = (props) => React.createElement(name, props, props ? props.children : null);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    default: createMockComponent('Svg'),
    Svg: createMockComponent('Svg'),
    Path: createMockComponent('Path'),
    G: createMockComponent('G'),
    Defs: createMockComponent('Defs'),
    LinearGradient: createMockComponent('LinearGradient'),
    RadialGradient: createMockComponent('RadialGradient'),
    Stop: createMockComponent('Stop'),
    Circle: createMockComponent('Circle'),
    Rect: createMockComponent('Rect'),
    ClipPath: createMockComponent('ClipPath'),
    Mask: createMockComponent('Mask'),
    Text: createMockComponent('Text'),
    TSpan: createMockComponent('TSpan'),
    Use: createMockComponent('Use'),
    Symbol: createMockComponent('Symbol'),
    Pattern: createMockComponent('Pattern'),
    Line: createMockComponent('Line'),
    Polyline: createMockComponent('Polyline'),
    Polygon: createMockComponent('Polygon'),
  };
});



