import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  Easing,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Approved Master Concept 3 Brand Monogram Asset
const BrandLogo = require('../../assets/brand-logo.png');

// Realistic Restaurant Food Cutout Assets
const PizzaSliceImg = require('../../assets/illustrations/pizza_slice_tilted.png');
const SoftServeConeImg = require('../../assets/illustrations/soft_serve_cone.png');
const StrawberryImg = require('../../assets/illustrations/strawberry.png');
const CheeseWedgeImg = require('../../assets/illustrations/cheese_wedge.png');
const PepperoniImg = require('../../assets/illustrations/pepperoni_slice.png');
const IceCreamSwirlImg = require('../../assets/illustrations/ice_cream_swirl.png');
const BasilLeafImg = require('../../assets/illustrations/basil_leaf.png');
const MushroomImg = require('../../assets/illustrations/mushroom_slice.png');
const SparkleImg = require('../../assets/illustrations/sparkle_gold.png');

export interface BrandedLaunchScreenProps {
  /**
   * Indicates whether catalog data and initial state are ready
   */
  isAppReady: boolean;
  /**
   * Callback fired when launch animations (entrance + hold + exit fade) are fully complete
   */
  onAnimationComplete: () => void;
  /**
   * Optional test ID for automated testing
   */
  testID?: string;
}

export const BrandedLaunchScreen: React.FC<BrandedLaunchScreenProps> = ({
  isAppReady,
  onAnimationComplete,
  testID = 'branded-launch-screen',
}) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Central Brand Animated Values
  // Initial values match native splash (opacity 1.0) for zero-frame flicker handoff
  const [logoScale] = useState(() => new Animated.Value(1.0));
  const [logoOpacity] = useState(() => new Animated.Value(1.0));
  const [ring1Scale] = useState(() => new Animated.Value(0.96));
  const [ring1Opacity] = useState(() => new Animated.Value(0));
  const [ring2Scale] = useState(() => new Animated.Value(0.98));
  const [ring2Opacity] = useState(() => new Animated.Value(0));
  const [contentTranslateY] = useState(() => new Animated.Value(10));
  const [contentOpacity] = useState(() => new Animated.Value(0));

  // Realistic Food Cutout Ambient Motion Values
  const [foodEntranceOpacity] = useState(() => new Animated.Value(0));
  const [floatingVal1] = useState(() => new Animated.Value(0));
  const [floatingVal2] = useState(() => new Animated.Value(0));
  const [sparklePulse] = useState(() => new Animated.Value(1.0));

  // Screen Exit Crossfade
  const [screenOpacity] = useState(() => new Animated.Value(1));

  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  const exitStartedRef = useRef(false);
  const breathingLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const floatingLoop1Ref = useRef<Animated.CompositeAnimation | null>(null);
  const floatingLoop2Ref = useRef<Animated.CompositeAnimation | null>(null);
  const sparkleLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasHiddenNativeSplash = useRef(false);

  // 1. Seamless native splash dismiss on layout (guarantees view is rendered before hiding native splash)
  const handleLayout = useCallback(() => {
    if (!hasHiddenNativeSplash.current) {
      hasHiddenNativeSplash.current = true;
      SplashScreen.hideAsync().catch(() => {
        /* Gracefully ignore in web or test environments */
      });
    }
  }, []);

  // 2. Choreographed Entrance & Dynamic Food Motion
  useEffect(() => {
    let isMounted = true;
    let minTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    async function startSequence() {
      const isReducedMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);

      if (!isMounted) return;

      if (isReducedMotion) {
        // Accessibility fallback: direct, restrained fade
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(foodEntranceOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]).start();

        minTimer = setTimeout(() => {
          if (isMounted) setMinDurationElapsed(true);
        }, 7000);

        return;
      }

      // Phase A: Entrance Orchestration across 0 to 7 seconds
      Animated.parallel([
        // 1. Ring 1 (Inner Gold Ring) at 350ms (0–2s window)
        Animated.sequence([
          Animated.delay(350),
          Animated.parallel([
            Animated.timing(ring1Scale, {
              toValue: 1.02,
              duration: 950,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ring1Opacity, {
              toValue: 0.60,
              duration: 800,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
        // 2. Ring 2 (Outer Gold Ring) at 650ms (0–2s window)
        Animated.sequence([
          Animated.delay(650),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 1.04,
              duration: 1050,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0.32,
              duration: 900,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
        // 3. Surrounding Realistic Food Cutouts Entrance at 1800ms (2–4s window)
        Animated.sequence([
          Animated.delay(1800),
          Animated.timing(foodEntranceOpacity, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // 4. Brand Typography & Tagline Pill at 2600ms (prominent across 4–6s)
        Animated.sequence([
          Animated.delay(2600),
          Animated.parallel([
            Animated.timing(contentTranslateY, {
              toValue: 0,
              duration: 850,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 750,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => {
        if (!isMounted) return;

        // Phase B: Gentle Coordinated Motion Loops
        // 1. Concentric Ring Breathing Loop
        const breathingLoop = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(ring1Scale, {
                toValue: 1.035,
                duration: 1800,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring1Opacity, {
                toValue: 0.65,
                duration: 1800,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring2Scale, {
                toValue: 1.055,
                duration: 1800,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring2Opacity, {
                toValue: 0.38,
                duration: 1800,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(ring1Scale, {
                toValue: 1.02,
                duration: 1600,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring1Opacity, {
                toValue: 0.50,
                duration: 1600,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring2Scale, {
                toValue: 1.035,
                duration: 1600,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ring2Opacity, {
                toValue: 0.28,
                duration: 1600,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        breathingLoopRef.current = breathingLoop;
        breathingLoop.start();

        // 2. Realistic Food Floating Cluster 1 (Slow, gentle oscillation -4 to +4 dp)
        const floatLoop1 = Animated.loop(
          Animated.sequence([
            Animated.timing(floatingVal1, {
              toValue: 1,
              duration: 3600,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(floatingVal1, {
              toValue: 0,
              duration: 3600,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );
        floatingLoop1Ref.current = floatLoop1;
        floatLoop1.start();

        // 3. Realistic Food Floating Cluster 2 (Counter-phase oscillation +4 to -4 dp)
        const floatLoop2 = Animated.loop(
          Animated.sequence([
            Animated.timing(floatingVal2, {
              toValue: 1,
              duration: 4200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(floatingVal2, {
              toValue: 0,
              duration: 4200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );
        floatingLoop2Ref.current = floatLoop2;
        floatLoop2.start();

        // 4. Sparkle Twinkle Pulse (1.0 to 1.15 scale)
        const sparkleLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(sparklePulse, {
              toValue: 1.15,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(sparklePulse, {
              toValue: 0.95,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        );
        sparkleLoopRef.current = sparkleLoop;
        sparkleLoop.start();
      });

      // Pacing Target: ~7 seconds (7000ms) minimum display duration before exit
      minTimer = setTimeout(() => {
        if (isMounted) setMinDurationElapsed(true);
      }, 7000);

      // Safety watchdog timeout: 10000ms max guarantee so splash NEVER stays stuck indefinitely
      safetyTimer = setTimeout(() => {
        if (isMounted) {
          setMinDurationElapsed(true);
        }
      }, 10000);
    }

    startSequence();

    return () => {
      isMounted = false;
      if (minTimer) clearTimeout(minTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (breathingLoopRef.current) {
        breathingLoopRef.current.stop();
        breathingLoopRef.current = null;
      }
      if (floatingLoop1Ref.current) {
        floatingLoop1Ref.current.stop();
        floatingLoop1Ref.current = null;
      }
      if (floatingLoop2Ref.current) {
        floatingLoop2Ref.current.stop();
        floatingLoop2Ref.current = null;
      }
      if (sparkleLoopRef.current) {
        sparkleLoopRef.current.stop();
        sparkleLoopRef.current = null;
      }
    };
  }, [
    contentOpacity,
    contentTranslateY,
    floatingVal1,
    floatingVal2,
    foodEntranceOpacity,
    ring1Opacity,
    ring1Scale,
    ring2Opacity,
    ring2Scale,
    sparklePulse,
  ]);

  // 3. Reliable, Bulletproof Exit Transition
  useEffect(() => {
    let exitTimer: ReturnType<typeof setTimeout> | null = null;

    if (minDurationElapsed && isAppReady && !exitStartedRef.current) {
      exitStartedRef.current = true;

      // Stop ambient loops
      if (breathingLoopRef.current) breathingLoopRef.current.stop();
      if (floatingLoop1Ref.current) floatingLoop1Ref.current.stop();
      if (floatingLoop2Ref.current) floatingLoop2Ref.current.stop();
      if (sparkleLoopRef.current) sparkleLoopRef.current.stop();

      // Safety guarantee: call completion if animation callback is delayed or interrupted
      exitTimer = setTimeout(() => {
        onAnimationComplete();
      }, 500);

      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        if (exitTimer) clearTimeout(exitTimer);
        onAnimationComplete();
      });
    }

    return () => {
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [minDurationElapsed, isAppReady, screenOpacity, onAnimationComplete]);

  // Proportional Responsive Scale anchored to 360dp mobile baseline
  const scale = width / 360;
  const crestSize = Math.min(Math.round(width * 0.44), 165);
  const ring1Diameter = crestSize + 28;
  const ring2Diameter = crestSize + 64;

  // Slow, subtle floating transform interpolations (restrained ±4dp)
  const floatY1 = floatingVal1.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 4],
  });

  const floatY2 = floatingVal2.interpolate({
    inputRange: [0, 1],
    outputRange: [4, -4],
  });

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        {
          opacity: screenOpacity,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
      onLayout={handleLayout}
      pointerEvents="auto"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      accessible
      accessibilityRole="none"
      accessibilityLabel="AY Pizza & Ice Cream Launch Screen"
    >
      {/* ============================================================== */}
      {/* LAYER 1: SURROUNDING REALISTIC RESTAURANT FOOD CUTOUTS         */}
      {/* (Constrained to outer perimeter; middle clear zone protected)  */}
      {/* ============================================================== */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: foodEntranceOpacity }]}
        pointerEvents="none"
      >
        {/* --- TOP-LEFT CORNER --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: Math.max(insets.top + 8, 20),
              left: -20 * scale,
              width: 130 * scale,
              height: 130 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '-22deg' }],
            },
          ]}
        >
          <Image source={PizzaSliceImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: Math.max(insets.top + 95, 115),
              left: 85 * scale,
              width: 45 * scale,
              height: 45 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '30deg' }],
            },
          ]}
        >
          <Image source={BasilLeafImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.sparkleItem,
            {
              top: Math.max(insets.top + 130, 150),
              left: 30 * scale,
              width: 28 * scale,
              height: 28 * scale,
              transform: [{ scale: sparklePulse }, { rotate: '10deg' }],
            },
          ]}
        >
          <Image source={SparkleImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        {/* --- TOP-RIGHT CORNER --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: Math.max(insets.top + 6, 18),
              right: -25 * scale,
              width: 130 * scale,
              height: 130 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '18deg' }],
            },
          ]}
        >
          <Image source={SoftServeConeImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: Math.max(insets.top + 105, 125),
              right: 85 * scale,
              width: 50 * scale,
              height: 50 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '-15deg' }],
            },
          ]}
        >
          <Image source={StrawberryImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.sparkleItem,
            {
              top: Math.max(insets.top + 135, 155),
              right: 35 * scale,
              width: 26 * scale,
              height: 26 * scale,
              transform: [{ scale: sparklePulse }, { rotate: '15deg' }],
            },
          ]}
        >
          <Image source={SparkleImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        {/* --- MID-LEFT FLANK (Pinned to border; protects central clear zone) --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.38,
              left: -15 * scale,
              width: 68 * scale,
              height: 68 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '12deg' }],
            },
          ]}
        >
          <Image source={PepperoniImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.46,
              left: -18 * scale,
              width: 72 * scale,
              height: 72 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '-15deg' }],
            },
          ]}
        >
          <Image source={CheeseWedgeImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        {/* --- MID-RIGHT FLANK (Pinned to border; protects central clear zone) --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.36,
              right: -16 * scale,
              width: 70 * scale,
              height: 70 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '-14deg' }],
            },
          ]}
        >
          <Image source={IceCreamSwirlImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.45,
              right: -14 * scale,
              width: 62 * scale,
              height: 62 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '20deg' }],
            },
          ]}
        >
          <Image source={MushroomImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        {/* --- MID-LOWER PERIMETER (Safe clearance below tagline pill) --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.62,
              left: 28 * scale,
              width: 54 * scale,
              height: 54 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '-12deg' }],
            },
          ]}
        >
          <Image source={StrawberryImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              top: height * 0.62,
              right: 28 * scale,
              width: 52 * scale,
              height: 52 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '25deg' }],
            },
          ]}
        >
          <Image source={BasilLeafImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.sparkleItem,
            {
              top: height * 0.66,
              left: 85 * scale,
              width: 26 * scale,
              height: 26 * scale,
              transform: [{ scale: sparklePulse }, { rotate: '18deg' }],
            },
          ]}
        >
          <Image source={SparkleImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.sparkleItem,
            {
              top: height * 0.66,
              right: 85 * scale,
              width: 26 * scale,
              height: 26 * scale,
              transform: [{ scale: sparklePulse }, { rotate: '-12deg' }],
            },
          ]}
        >
          <Image source={SparkleImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        {/* --- BOTTOM SECTION --- */}
        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              bottom: Math.max(insets.bottom + 15, 25),
              left: -10 * scale,
              width: 100 * scale,
              height: 100 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '20deg' }],
            },
          ]}
        >
          <Image source={CheeseWedgeImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              bottom: Math.max(insets.bottom + 8, 18),
              left: width * 0.35,
              width: 115 * scale,
              height: 115 * scale,
              transform: [{ translateY: floatY2 }, { rotate: '5deg' }],
            },
          ]}
        >
          <Image source={PizzaSliceImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.foodItem,
            styles.foodSubdued,
            {
              bottom: Math.max(insets.bottom + 15, 25),
              right: -15 * scale,
              width: 115 * scale,
              height: 115 * scale,
              transform: [{ translateY: floatY1 }, { rotate: '-16deg' }],
            },
          ]}
        >
          <Image source={SoftServeConeImg} style={styles.fullImage} resizeMode="contain" />
        </Animated.View>
      </Animated.View>

      {/* ============================================================== */}
      {/* LAYER 2: CENTRAL BRAND FOCAL POINT (PROTECTED CLEAR ZONE)      */}
      {/* ============================================================== */}
      <View style={styles.centerStage} pointerEvents="none">
        {/* Dedicated Logo Stage with mathematically locked concentric centering */}
        <View style={[styles.logoStage, { width: crestSize, height: crestSize }]}>
          {/* Ring 2: Outer Concentric Golden Ring */}
          <Animated.View
            testID="launch-ring-outer"
            style={[
              styles.ringOuter,
              {
                width: ring2Diameter,
                height: ring2Diameter,
                borderRadius: ring2Diameter / 2,
                left: (crestSize - ring2Diameter) / 2,
                top: (crestSize - ring2Diameter) / 2,
                opacity: ring2Opacity,
                transform: [{ scale: ring2Scale }],
              },
            ]}
          />

          {/* Ring 1: Inner Concentric Golden Ring */}
          <Animated.View
            testID="launch-ring-inner"
            style={[
              styles.ringInner,
              {
                width: ring1Diameter,
                height: ring1Diameter,
                borderRadius: ring1Diameter / 2,
                left: (crestSize - ring1Diameter) / 2,
                top: (crestSize - ring1Diameter) / 2,
                opacity: ring1Opacity,
                transform: [{ scale: ring1Scale }],
              },
            ]}
          />

          {/* Approved Concept 3 AY Brand Master Emblem */}
          <Animated.View
            testID="launch-logo-crest"
            style={[
              styles.crestWrapper,
              {
                width: crestSize,
                height: crestSize,
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <Image
              source={BrandLogo}
              style={styles.crestImage}
              resizeMode="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel="AY Pizza & Ice Cream Brand Logo"
            />
          </Animated.View>
        </View>

        {/* Animated Brand Typography & Tagline Pill (100% Address-Free) */}
        <Animated.View
          style={[
            styles.contentContainer,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          <Text style={styles.brandTitleText}>AY PIZZA</Text>
          <Text style={styles.brandSubTitleText}>& ICE CREAM</Text>
          <View style={styles.taglinePill}>
            <Text style={styles.taglineStar}>★</Text>
            <Text style={styles.taglineText}>ARTISAN PIZZAS & FRESH SOFT-SERVE</Text>
            <Text style={styles.taglineStar}>★</Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#B91C1C', // Approved Primary Pizza Red
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 9999,
  },
  foodItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodSubdued: {
    opacity: 0.60, // Refined to approximately 60% individual opacity
  },
  sparkleItem: {
    opacity: 0.35, // Refined to 30-40% individual opacity
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  centerStage: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  logoStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.58)',
  },
  ringOuter: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 1.0,
    borderColor: 'rgba(245, 158, 11, 0.30)',
  },
  crestWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestImage: {
    width: '100%',
    height: '100%',
  },
  contentContainer: {
    alignItems: 'center',
    marginTop: 18,
  },
  brandTitleText: {
    fontSize: 27,
    fontWeight: '900',
    color: '#FFF7E6', // Warm cream
    letterSpacing: 5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  brandSubTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F59E0B', // Golden orange
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  taglinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    marginTop: 10,
    gap: 6,
  },
  taglineStar: {
    fontSize: 10,
    color: '#F59E0B',
  },
  taglineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF7E6',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
