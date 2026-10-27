import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Memory, Moment, Person } from './src/core/model';
import { ChatScreen } from './src/screens/ChatScreen';
import { CreateMenu } from './src/screens/CreateMenu';
import { HomeScreen } from './src/screens/HomeScreen';
import { AiSettings, MeScreen } from './src/screens/MeScreen';
import { MemoryEditor } from './src/screens/MemoryEditor';
import { MomentEditor, MomentsScreen } from './src/screens/MomentEditor';
import { PersonEditor } from './src/screens/PersonEditor';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';

/** 弹出的页面 */
export type Route =
  | { name: 'create' }
  | { name: 'person'; person?: Person }
  | { name: 'memory'; personId: string; memory?: Memory }
  | { name: 'moment'; personId: string; moment?: Moment }
  | { name: 'chat'; personId: string }
  | { name: 'moments' }
  | { name: 'ai' };

export type Navigate = (route: Route | null) => void;

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'home' | 'me'>('home');
  const [route, setRoute] = useState<Route | null>(null);

  // 先关掉当前弹层再打开下一个，避免 iOS 上两个弹层同时出现
  const navigate = useCallback<Navigate>(
    (next) => {
      if (route && next) {
        setRoute(null);
        setTimeout(() => setRoute(next), 450);
      } else {
        setRoute(next);
      }
    },
    [route],
  );
  const close = () => setRoute(null);

  if (!store.ready) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {tab === 'home' ? <HomeScreen navigate={navigate} goToMe={() => setTab('me')} /> : <MeScreen navigate={navigate} goHome={() => setTab('home')} />}
      </View>

      {/* 底部栏 */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TabItem icon="heart" title="念着的人" active={tab === 'home'} onPress={() => setTab('home')} />
        <Pressable
          onPress={() => navigate(store.library.people.length ? { name: 'create' } : { name: 'person' })}
          style={styles.plus}
          accessibilityRole="button"
          accessibilityLabel="创建"
        >
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </Pressable>
        <TabItem icon="person" title="我的" active={tab === 'me'} onPress={() => setTab('me')} />
      </View>

      {route?.name === 'create' && <CreateMenu navigate={navigate} onClose={close} />}
      {route?.name === 'person' && <PersonEditor person={route.person} onClose={close} />}
      {route?.name === 'memory' && <MemoryEditor personId={route.personId} memory={route.memory} onClose={close} />}
      {route?.name === 'moment' && <MomentEditor personId={route.personId} moment={route.moment} onClose={close} />}
      {route?.name === 'chat' && <ChatScreen personId={route.personId} navigate={navigate} onClose={close} />}
      {route?.name === 'moments' && <MomentsScreen navigate={navigate} onClose={close} />}
      {route?.name === 'ai' && <AiSettings onClose={close} />}

      {store.toast && (
        <View pointerEvents="none" style={[styles.toast, { top: insets.top + 8 }]}>
          <Text style={styles.toastText}>{store.toast}</Text>
        </View>
      )}
    </View>
  );
}

function TabItem({ icon, title, active, onPress }: { icon: 'heart' | 'person'; title: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Ionicons name={active ? icon : (`${icon}-outline` as const)} size={24} color={active ? colors.ink : colors.sub} />
      <Text style={[styles.tabText, { color: active ? colors.ink : colors.sub }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingTop: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabText: { fontSize: 11, fontWeight: '700' },
  plus: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.bg,
  },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  toastText: { color: '#FFFFFF', fontWeight: '700' },
});
