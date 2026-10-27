import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useState } from 'react';
import type { Navigate } from '../../App';
import { chineseDate, daysLabel, kindInfo, type Moment, MOMENT_KINDS, newId, toDateString, upcoming, upcomingOf } from '../core/model';
import { PersonFigure } from '../components/Figure';
import { Card, Chip, DateField, Field, Label, MomentRow, PrimaryButton, Sheet, TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';

const REMIND: { title: string; value: number | null }[] = [
  { title: '不提醒', value: null },
  { title: '当天', value: 0 },
  { title: '提前 1 天', value: 1 },
  { title: '提前 3 天', value: 3 },
  { title: '提前 7 天', value: 7 },
];

/** 添加 / 编辑重要日子 */
export function MomentEditor({ personId, moment, onClose }: { personId: string; moment?: Moment; onClose: () => void }) {
  const store = useStore();
  const isNew = !moment;
  const [draft, setDraft] = useState<Moment>(
    () => moment ?? { id: newId(), personId, title: '生日', kind: 'birthday', date: toDateString(new Date()), repeatsYearly: true, remindDaysBefore: 1 },
  );
  const set = (patch: Partial<Moment>) => setDraft((d) => ({ ...d, ...patch }));

  const pickKind = (kind: Moment['kind']) => {
    const info = kindInfo(kind);
    // 名称还是默认值时跟着类型换
    const isDefaultTitle = !draft.title || MOMENT_KINDS.some((k) => k.title === draft.title);
    set({ kind, repeatsYearly: info.repeats, ...(isDefaultTitle ? { title: info.title } : {}) });
  };

  const u = upcomingOf(draft);
  const preview = `下一次：${chineseDate(u.date)}，${daysLabel(u)}${draft.kind === 'birthday' && u.years ? `，满 ${u.years} 岁` : ''}`;

  const save = () => {
    store.saveMoment({ ...draft, title: draft.title.trim() });
    store.show('已保存');
    onClose();
  };

  const remove = () =>
    Alert.alert('删除这个日子？', undefined, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          store.deleteMoment(draft.id);
          onClose();
        },
      },
    ]);

  return (
    <Sheet
      visible
      title={isNew ? '添加重要日子' : '重要日子'}
      onClose={onClose}
      right={!isNew ? <TextButton title="删除" color={colors.danger} onPress={remove} /> : undefined}
      footer={<PrimaryButton title="保存" onPress={save} disabled={!draft.title.trim()} />}
    >
      <Card>
        <Label>是谁的</Label>
        <View style={styles.wrap}>
          {store.library.people.map((p) => (
            <Chip key={p.id} title={p.name} selected={draft.personId === p.id} onPress={() => set({ personId: p.id })} />
          ))}
        </View>
      </Card>

      <Card>
        <Label>类型</Label>
        <View style={styles.wrap}>
          {MOMENT_KINDS.map((k) => (
            <Chip key={k.kind} title={`${k.emoji} ${k.title}`} selected={draft.kind === k.kind} onPress={() => pickKind(k.kind)} />
          ))}
        </View>
        <Field value={draft.title} onChangeText={(title) => set({ title })} placeholder="名称，比如：编程等级考试" style={{ marginTop: 12 }} maxLength={20} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Label>{draft.kind === 'birthday' ? '出生日期' : '日期'}</Label>
        <DateField value={draft.date} onChange={(date) => set({ date })} />
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>每年重复</Text>
          <Switch value={draft.repeatsYearly} onValueChange={(repeatsYearly) => set({ repeatsYearly })} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={styles.preview}>{preview}</Text>
      </Card>

      <Card>
        <Label>提醒（早上 9 点）</Label>
        <View style={styles.wrap}>
          {REMIND.map((r) => (
            <Chip key={r.title} title={r.title} selected={draft.remindDaysBefore === r.value} onPress={() => set({ remindDaysBefore: r.value })} />
          ))}
        </View>
      </Card>
    </Sheet>
  );
}

/** 所有人接下来的重要日子 */
export function MomentsScreen({ navigate, onClose }: { navigate: Navigate; onClose: () => void }) {
  const { library } = useStore();
  const all = upcoming(library);
  return (
    <Sheet visible title="重要日子" onClose={onClose}>
      {all.length === 0 && <Text style={styles.empty}>还没有重要日子。在人物主页添加生日、纪念日，这里会按远近排好。</Text>}
      {all.map((u) => {
        const p = library.people.find((x) => x.id === u.moment.personId);
        return (
          <Card key={u.moment.id} style={styles.item}>
            {p && (
              <View style={styles.avatar}>
                <PersonFigure person={p} size={46} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <MomentRow u={u} personName={p?.name} onPress={() => navigate({ name: 'moment', personId: u.moment.personId, moment: u.moment })} />
            </View>
          </Card>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  preview: { fontSize: 13, color: colors.sub },
  empty: { color: colors.sub, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
