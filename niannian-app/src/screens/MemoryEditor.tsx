import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { describeError, organize } from '../ai';
import { type Memory, newId, offlineOrganize, toDateString } from '../core/model';
import { PersonFigure } from '../components/Figure';
import { Card, DateField, Field, PrimaryButton, Sheet, TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';

/** 记一件小事 */
export function MemoryEditor({ personId, memory, onClose }: { personId: string; memory?: Memory; onClose: () => void }) {
  const store = useStore();
  const person = store.library.people.find((p) => p.id === personId);
  const isNew = !memory;
  const [title, setTitle] = useState(memory?.title ?? '');
  const [text, setText] = useState(memory?.text ?? '');
  const [hasDate, setHasDate] = useState(isNew || memory?.date != null);
  const [date, setDate] = useState(memory?.date ?? toDateString(new Date()));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [original, setOriginal] = useState<{ title: string; text: string } | null>(null);

  const canSave = text.trim().length > 0;

  const runOrganize = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = store.apiKey ? await organize(store.apiKey, text, person) : offlineOrganize(text);
      if (!original) setOriginal({ title, text });
      setTitle(result.title);
      setText(result.text);
      setNote(store.apiKey ? '整理好了，不满意可以直接改，或者点“撤销”。' : '离线模式只做了简单整理。在“我的 → AI 设置”填上 API Key 效果更好。');
    } catch (e) {
      setNote(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    store.saveMemory({
      id: memory?.id ?? newId(),
      personId,
      title: title.trim(),
      text: text.trim(),
      date: hasDate ? date : null,
      createdAt: memory?.createdAt ?? new Date().toISOString(),
    });
    store.show(isNew ? '记下了' : '已保存');
    onClose();
  };

  const remove = () =>
    Alert.alert('删除这件小事？', undefined, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          store.deleteMemory(memory!.id);
          onClose();
        },
      },
    ]);

  return (
    <Sheet
      visible
      title={isNew ? '记一件小事' : '小事'}
      onClose={onClose}
      right={!isNew ? <TextButton title="删除" color={colors.danger} onPress={remove} /> : undefined}
      footer={<PrimaryButton title={isNew ? '记下来' : '保存'} onPress={save} disabled={!canSave} />}
    >
      {person && (
        <View style={styles.header}>
          <View style={styles.avatar}>
            <PersonFigure person={person} size={50} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>关于{person.name}</Text>
            <Text style={styles.headerSub}>不用写得完整，一两句话就好。键盘上的麦克风可以直接说。</Text>
          </View>
        </View>
      )}

      <Card style={{ gap: 12 }}>
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>写上事情发生的日期</Text>
          <Switch value={hasDate} onValueChange={setHasDate} trackColor={{ true: colors.primary }} />
        </View>
        {hasDate && <DateField value={date} onChange={setDate} maximumDate={new Date()} />}
        <Field value={title} onChangeText={setTitle} placeholder="标题（可以不写）" maxLength={30} />
        <Field value={text} onChangeText={setText} placeholder="比如：侄女最近迷上画小猫，下次带一盒彩笔给她。" multiline autoFocus={isNew} />
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={styles.switchRow}>
          <Text style={styles.aiTitle}>✨ 帮我整理</Text>
          {original && (
            <TextButton
              title="撤销"
              onPress={() => {
                setTitle(original.title);
                setText(original.text);
                setOriginal(null);
                setNote(null);
              }}
            />
          )}
        </View>
        <Text style={styles.headerSub}>{note ?? '起个标题、把口语理顺，整理完都还能改。'}</Text>
        <Pressable onPress={runOrganize} disabled={!canSave || busy} style={[styles.aiButton, (!canSave || busy) && { opacity: 0.5 }]} accessibilityRole="button">
          {busy && <ActivityIndicator color={colors.ink} size="small" />}
          <Text style={styles.aiButtonText}>{busy ? '整理中…' : '整理这段文字'}</Text>
        </Pressable>
      </Card>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  headerSub: { fontSize: 13, color: colors.sub, marginTop: 2, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  aiTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  aiButton: { flexDirection: 'row', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.mint, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center' },
  aiButtonText: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
