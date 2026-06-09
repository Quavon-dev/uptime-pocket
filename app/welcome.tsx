/**
 * Welcome / Onboarding — 3-screen swipeable flow.
 *
 * Why a flow now?
 * ---------------
 * v0.x had a single "add your server" screen. v1.0 is a full app with
 * notifications, widgets, and a security model, so first impressions
 * matter. We give the user:
 *   1. What this app is (one screen, one clear value prop)
 *   2. How it stays private (credentials in Keychain, no cloud)
 *   3. The CTA: add your first server
 *
 * Skippable from any screen ("Skip" in the top-right of screens 1+2).
 *
 * Onboarding state
 * ----------------
 * The `hasOnboarded` flag in the settings store (already persisted by
 * Phase A1) tracks whether the user has finished this flow. The
 * OnboardingGate in app/_layout.tsx reads it and re-routes here when
 * it's false.
 *
 * We intentionally do NOT require the user to swipe through all three
 * screens — tapping "Get started" on screen 1 is enough. Skipping
 * still marks `hasOnboarded` true so they don't see this again.
 */

import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItem,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  Activity,
  ChevronRight,
  Shield,
  Zap,
} from 'lucide-react-native';
import { spacing, typography, useAppTheme } from '@/theme';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n';
import { useSettings } from '@/data/store/settings';

interface Screen {
  key: 'intro' | 'privacy' | 'connect';
  icon: React.ReactNode;
  titleKey: string;
  bodyKey: string;
}

const SCREENS: Screen[] = [
  {
    key: 'intro',
    icon: <Activity size={48} strokeWidth={1.5} />,
    titleKey: 'onboarding.flow.intro.title',
    bodyKey: 'onboarding.flow.intro.body',
  },
  {
    key: 'privacy',
    icon: <Shield size={48} strokeWidth={1.5} />,
    titleKey: 'onboarding.flow.privacy.title',
    bodyKey: 'onboarding.flow.privacy.body',
  },
  {
    key: 'connect',
    icon: <Zap size={48} strokeWidth={1.5} />,
    titleKey: 'onboarding.flow.connect.title',
    bodyKey: 'onboarding.flow.connect.body',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { surface, brand, brandFill } = useAppTheme();
  const hasOnboarded = useSettings((s) => s.hasOnboarded);
  const setOnboarded = useSettings((s) => s.setOnboarded);

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Screen>>(null);

  const finish = useCallback(() => {
    if (!hasOnboarded) setOnboarded(true);
    router.push('/servers/add');
  }, [hasOnboarded, setOnboarded, router]);

  const skip = useCallback(() => {
    if (!hasOnboarded) setOnboarded(true);
    router.push('/servers/add');
  }, [hasOnboarded, setOnboarded, router]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (i !== index) setIndex(i);
  }, [index, screenWidth]);

  const goNext = useCallback(() => {
    if (index >= SCREENS.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [index, finish]);

  const renderItem: ListRenderItem<Screen> = ({ item }) => (
    <View style={[styles.slide, { width: screenWidth }]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: brandFill },
        ]}>
        {item.icon}
      </View>
      <Text
        style={[
          typography.title,
          styles.title,
          { color: surface.text },
        ]}>
        {t(item.titleKey)}
      </Text>
      <Text
        style={[
          typography.body,
          styles.body,
          { color: surface.textMuted },
        ]}>
        {t(item.bodyKey)}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: surface.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* Top bar: skip button on screens 1 and 2 */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + spacing[2] },
        ]}>
        {index < SCREENS.length - 1 ? (
          <Pressable
            onPress={skip}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[typography.body, { color: surface.textMuted }]}>
              {t('common.skip')}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SCREENS}
        renderItem={renderItem}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({
          length: screenWidth,
          offset: screenWidth * i,
          index: i,
        })}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SCREENS.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.dot,
              {
                backgroundColor: i === index ? brand : surface.sunken,
                width: i === index ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Bottom CTA */}
      <View
        style={[
          styles.bottom,
          { paddingBottom: insets.bottom + spacing[4] },
        ]}>
        <Button
          label={
            index >= SCREENS.length - 1
              ? t('onboarding.cta')
              : t('common.continue')
          }
          onPress={goNext}
          variant="primary"
          size="lg"
          fullWidth
          icon={<ChevronRight size={18} color="white" strokeWidth={2.5} />}
          iconPosition="right"
        />

        <Text
          style={[
            typography.micro,
            styles.hint,
            { color: surface.textMuted },
          ]}>
          {t('onboarding.hint')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[6],
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing[4],
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  bottom: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  hint: {
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
});
