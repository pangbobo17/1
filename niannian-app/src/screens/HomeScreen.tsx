import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Navigate } from '../../App';
import { chineseMonthDay, currentPerson, kindInfo, memoriesOf, type Person, upcoming } from '../core/model';
import { LivelyFigure, PersonFigure } from '../components/Figure';
import { Mascot } from '../components/Mascot';
import { AddRow, Card, DaysBadge, MemoryRow, MomentRow, PrimaryButton, SectionHeader, TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';

export function HomeScreen({ navigate, goToMe }: { navigate: Navigate; goToMe: () => void }) {
  const { library } = useStore();
  const person = currentPerson(library);
  if (!person) return <EmptyHome navigate={navigate} />;
  return <PersonPage person={person} navigate={navigate} goToMe={goToMe} />;
}

export function Logo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={styles.logo}>念念</Text>
      <View style={styles.logoDot} />
    </View>
  );
}

function EmptyHome({ navigate }: { navigate: Navigate }) {
  const { loadSample } = useStore();
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Logo />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Mascot size={140} />
        <Text style={styles.emptyTitle}>把在意的人放在心上</Text>
        <Text style={styles.emptySub}>给每个人一个小角落：记下生日和纪念日，{'\n'}存下日常小事，到日子前提醒你。</Text>
      </View>
      <View style={{ gap: 14 }}>
        <PrimaryButton title="添加第一个人" onPress={() => navigate({ name: 'person' })} />
        <View style={{ alignItems: 'center' }}>
          <TextButton title="先看看示例" onPress={loadSample} />
        </View>
      </View>
    </View>
  );
}

function PersonPage({ person, navigate, goToMe }: { person: Person; navigate: Navigate; goToMe: () => void }) {
  const { library, select } = useStore();
  const { width } = useWindowDimensions();
  const ups = upcoming(library, person.id);
  const next = ups.find((u) => !u.isPast);
  const memories = memoriesOf(library, person.id);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Logo />
        <Pressable onPress={goToMe} style={styles.countPill} accessibilityRole="button">
          <Ionicons name="people" size={14} color={colors.ink} />
          <Text style={styles.countText}>{library.people.length} 位</Text>
        </Pressable>
      </View>

      {/* 人物切换：横向一排小头像 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {library.people.map((p) => {
          const active = p.id === person.id;
          return (
            <Pressable key={p.id} onPress={() => select(p.id)} style={[styles.avatarPill, active && styles.avatarPillActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <View style={styles.avatarMini}>
                <PersonFigure person={p} size={38} />
              </View>
              <Text style={[styles.avatarName, active && { color: '#FFFFFF' }]} numberOfLines={1}>{p.name}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => navigate({ name: 'person' })} style={styles.avatarPill} accessibilityRole="button" accessibilityLabel="添加在意的人">
          <Ionicons name="add" size={20} color={colors.ink} />
        </Pressable>
      </ScrollView>

      {/* 舞台：渐变背景卡片，小人站中间，团团在角落 */}
      <LinearGradient colors={[colors.primarySoft, '#FFF1E6', colors.mint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.stage}>
        <View style={styles.stageHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{person.name}</Text>
            {!!(person.relation || person.about) && (
              <Text style={styles.about} numberOfLines={2}>{[person.relation, person.about].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
          <Pressable onPress={() => navigate({ name: 'person', person })} style={styles.editButton} accessibilityRole="button" accessibilityLabel={`编辑${person.name}`}>
            <Ionicons name="create-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.figureArea}>
          <View style={styles.ground} />
          <LivelyFigure person={person} size={Math.min(width * 0.62, 280)} />
        </View>
        <Pressable onPress={() => navigate({ name: 'chat', personId: person.id })} style={styles.mascotButton} accessibilityRole="button" accessibilityLabel="问问团团">
          <Mascot size={56} />
          <Text style={styles.mascotText}>问问团团</Text>
        </Pressable>
      </LinearGradient>

      {next && (
        <Pressable onPress={() => navigate({ name: 'moment', personId: person.id, moment: next.moment })}>
          <Card style={styles.nextCard}>
            <Text style={{ fontSize: 34 }}>{kindInfo(next.moment.kind).emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.small}>下一个重要日子</Text>
              <Text style={styles.nextTitle} numberOfLines={1}>{next.moment.title}</Text>
              <Text style={styles.small}>{chineseMonthDay(next.date)}</Text>
            </View>
            <DaysBadge u={next} />
          </Card>
        </Pressable>
      )}

      <View>
        <SectionHeader title="重要日子" right={<TextButton title="全部" onPress={() => navigate({ name: 'moments' })} />} />
        <Card style={{ paddingVertical: 6 }}>
          {ups.slice(0, 4).map((u) => (
            <MomentRow key={u.moment.id} u={u} onPress={() => navigate({ name: 'moment', personId: person.id, moment: u.moment })} />
          ))}
          <AddRow title="添加生日、纪念日" onPress={() => navigate({ name: 'moment', personId: person.id })} />
        </Card>
      </View>

      <View>
        <SectionHeader title={`小事 · ${memories.length}`} />
        <Card style={{ paddingVertical: 6 }}>
          {memories.length === 0 && <Text style={[styles.small, { paddingVertical: 10 }]}>最近关于 TA，有什么小事想记住？一两句话就好。</Text>}
          {memories.map((m) => (
            <MemoryRow key={m.id} memory={m} onPress={() => navigate({ name: 'memory', personId: person.id, memory: m })} />
          ))}
          <AddRow title="记一件小事" onPress={() => navigate({ name: 'memory', personId: person.id })} />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logo: { fontSize: 24, fontWeight: '900', color: colors.ink, letterSpacing: 1 },
  logoDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  countText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  emptyTitle: { fontSize: 26, fontWeight: '900', color: colors.ink },
  emptySub: { fontSize: 15, color: colors.sub, textAlign: 'center', lineHeight: 22 },
  avatarPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 999, paddingLeft: 4, paddingRight: 12, height: 44, minWidth: 44, justifyContent: 'center' },
  avatarPillActive: { backgroundColor: colors.ink },
  avatarMini: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarName: { fontSize: 14, fontWeight: '700', color: colors.ink, maxWidth: 80 },
  stage: { borderRadius: 28, padding: 18, overflow: 'hidden' },
  stageHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 32, fontWeight: '900', color: colors.ink },
  about: { fontSize: 14, color: colors.sub, marginTop: 4, lineHeight: 20 },
  editButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  figureArea: { alignItems: 'center', justifyContent: 'flex-end', minHeight: 300, marginTop: 4 },
  ground: { position: 'absolute', bottom: 6, width: '70%', height: 30, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)' },
  mascotButton: { position: 'absolute', right: 14, bottom: 14, alignItems: 'center' },
  mascotText: { marginTop: -4, fontSize: 12, fontWeight: '800', color: colors.ink, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginVertical: 2 },
  small: { fontSize: 12, color: colors.sub },
});
