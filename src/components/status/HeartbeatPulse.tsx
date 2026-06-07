/**
 * Heartbeat pulse - a small indicator that animates when something
 * is alive and updating.
 *
 * Uses Reanimated 4 to scale the dot in a sine wave.
 * Drive it with the `active` prop; the component handles the rest.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface HeartbeatPulseProps {
  /** Color of the pulse */
  color: string;
  /** Whether the pulse is animating */
  active?: boolean;
  /** Size of the dot in pixels */
  size?: number;
}

export function HeartbeatPulse({ color, active = true, size = 8 }: HeartbeatPulseProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active) {
      // Two-pulse heartbeat pattern with a rest
      const pulse = () => {
        scale.value = withSequence(
          withTiming(1.6, { duration: 120, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 120, easing: Easing.in(Easing.quad) }),
          withTiming(1.4, { duration: 120, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 120, easing: Easing.in(Easing.quad) }),
          withTiming(1, { duration: 600, easing: Easing.linear })
        );
      };
      pulse();
      const interval = setInterval(pulse, 1080);
      return () => clearInterval(interval);
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [active, scale]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * 1.5 }],
    opacity: 0.4 * (1 - (scale.value - 1) / 0.6),
  }));

  return (
    <View style={{ width: size * 3, height: size * 3, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
          dotStyle,
        ]}
      />
    </View>
  );
}
