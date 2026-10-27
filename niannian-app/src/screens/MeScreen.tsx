import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Navigate } from '../../App';
import { PersonFigure } from '../components/Figure';
import { Card, Field, Label, PrimaryButton, SectionHeader, Sheet, TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';
import { Logo } from './HomeScreen';

export function MeScreen({ navigate, goHome }: { navigate: Navigate; goHome: () => void }) {
  const store = useStore();
  const { library } = store;
  const [notify, setNotify] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setNotify(p.status as typeof notify))
      .catch(() => {});
  }, []);

  const askNotify = async () => {
    if (notify === 'denied') {
      Linking.openSettings();
      return;
    }
    const p = await Notifications.requestPermissionsAsync();
    setNotify(p.status as typeof notify);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
      <Logo />
      <Card style={styles.summary}>
        <View style={{ flexDirection: 'row' }}>
          {library.people.slice(0, 3).map((p, i) => (
            <View key={p.id} style={[styles.stackAvatar, { marginLeft: i ? -14 : 0 }]}>
              <PersonFigure person={p} size={40} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>我的念念</Text>
          <Text style={styles.sub}>
            {library.people.length} 位人物 · {library.memories.length} 件小事 · {library.moments.length} 个日子
          </Text>
        </View>
      </Card>

      <View>
        <SectionHeader title="念着的人" />
        <Card style={{ paddingVertical: 6 }}>
          {library.people.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                store.select(p.id);
                goHome();
              }}
              style={styles.row}
              accessibilityRole="button"
            >
              <View style={styles.stackAvatar}>
                <PersonFigure person={p} size={40} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{p.name}</Text>
                {!!p.relation && <Text style={styles.sub}>{p.relation}</Text>}
              </View>
              <Pressable onPress={() => navigate({ name: 'person', person: p })} hitSlop={10} accessibilityLabel={`编辑${p.name}`}>
                <Ionicons name="create-outline" size={22} color={colors.sub} />
              </Pressable>
            </Pressable>
          ))}
          <Row icon="person-add-outline" title="添加在意的人" onPress={() => navigate({ name: 'person' })} />
        </Card>
      </View>

      <View>
        <SectionHeader title="设置" />
        <Card style={{ paddingVertical: 6 }}>
          <Row icon="calendar-outline" title="重要日子" sub="所有人的生日、纪念日" onPress={() => navigate({ name: 'moments' })} />
          <Row
            icon="notifications-outline"
            title="提醒"
            sub={notify === 'granted' ? '已开启，按每个日子的设置提前提醒' : notify === 'denied' ? '未开启，点这里去系统设置打开' : '到日子前提醒你'}
            onPress={askNotify}
          />
          <Row icon="sparkles-outline" title="AI 设置" sub={store.apiKey ? '已填写 API Key' : '未填写，团团用离线模式'} onPress={() => navigate({ name: 'ai' })} />
          <Row icon="share-outline" title="导出备份" sub="人物、照片、日子和小事存成一个文件" onPress={() => store.exportBackup().catch(() => store.show('导出失败'))} />
          <Row icon="download-outline" title="从备份恢复" sub="同一条资料会用备份里的覆盖" onPress={() => store.importBackup().catch(() => store.show('没能打开文件'))} />
        </Card>
      </View>

      <Text style={styles.footer}>资料只保存在这台手机上。只有在你填写 API Key 并使用团团时，相关资料才会发送给 AI 服务。</Text>
    </ScrollView>
  );
}

function Row({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.sub} />
    </Pressable>
  );
}

/** 填写 Claude API Key */
export function AiSettings({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [key, setKey] = useState(store.apiKey);
  return (
    <Sheet
      visible
      title="AI 设置"
      onClose={onClose}
      footer={
        <PrimaryButton
          title="保存"
          onPress={() => {
            store.setApiKey(key.trim());
            store.show(key.trim() ? '已保存' : '已清除，团团用离线模式');
            onClose();
          }}
        />
      }
    >
      <Card style={{ gap: 10 }}>
        <Label>Claude API Key</Label>
        <Field value={key} onChangeText={setKey} placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Text style={styles.sub}>
          填上之后，“问问团团”和“帮我整理”会用 Claude 来回答。Key 只保存在这台手机上，费用按你自己的 Anthropic 账号计算。不填也能用：团团会用离线模式做简单的回顾和送礼推荐。
        </Text>
        <TextButton title="去 console.anthropic.com 创建 Key" color={colors.primary} onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} />
      </Card>
      {!!store.apiKey && (
        <View style={{ alignItems: 'center' }}>
          <TextButton title="清除 Key" color={colors.danger} onPress={() => setKey('')} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stackAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.sub, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 12, color: colors.sub, textAlign: 'center', lineHeight: 18 },
});
