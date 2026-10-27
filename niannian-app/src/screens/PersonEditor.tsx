import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type AgeGroup,
  CLOTH_COLORS,
  defaultLook,
  HAIR_COLORS,
  type HairStyle,
  type Look,
  newId,
  type Person,
  SKINS,
  suggestLook,
} from '../core/model';
import { PersonFigure } from '../components/Figure';
import { Card, Chip, Field, Label, PrimaryButton, Sheet, TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';

const RELATIONS = ['老婆', '老公', '儿子', '女儿', '爸爸', '妈妈', '岳父', '岳母', '朋友', '我自己'];
const AGES: { value: AgeGroup; title: string }[] = [
  { value: 'kid', title: '小朋友' },
  { value: 'adult', title: '大人' },
  { value: 'elder', title: '长辈' },
];
const HAIRS: { value: HairStyle; title: string }[] = [
  { value: 'short', title: '短发' },
  { value: 'long', title: '长发' },
  { value: 'bun', title: '盘发' },
  { value: 'curly', title: '卷发' },
  { value: 'none', title: '光头' },
];

export function PersonEditor({ person, onClose }: { person?: Person; onClose: () => void }) {
  const store = useStore();
  const isNew = !person;
  const [draft, setDraft] = useState<Person>(
    () => person ?? { id: newId(), name: '', relation: '', about: '', look: defaultLook(), createdAt: new Date().toISOString() },
  );
  // 用户动过形象后，选关系就不再自动改形象
  const [lookTouched, setLookTouched] = useState(!isNew);
  const set = (patch: Partial<Person>) => setDraft((d) => ({ ...d, ...patch }));
  const setLook = (patch: Partial<Look>) => {
    setLookTouched(true);
    setDraft((d) => ({ ...d, look: { ...d.look, ...patch } }));
  };

  const pickRelation = (r: string) => {
    const relation = draft.relation === r ? '' : r;
    set({
      relation,
      name: draft.name || (r === '我自己' ? '' : r),
      ...(lookTouched || !relation ? {} : { look: suggestLook(relation) }),
    });
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    try {
      set({ photoUri: await store.keepPhoto(result.assets[0].uri) });
    } catch {
      store.show('照片保存失败');
    }
  };

  const save = () => {
    store.savePerson({ ...draft, name: draft.name.trim() });
    store.show(isNew ? `已添加${draft.name.trim()}` : '已保存');
    onClose();
  };

  const remove = () =>
    Alert.alert(`删除${draft.name}？`, 'TA 的重要日子和小事也会一起删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          store.deletePerson(draft.id);
          onClose();
        },
      },
    ]);

  return (
    <Sheet
      visible
      title={isNew ? '添加在意的人' : '编辑'}
      onClose={onClose}
      footer={<PrimaryButton title={isNew ? '添加' : '保存'} onPress={save} disabled={!draft.name.trim()} />}
    >
      <Card style={{ alignItems: 'center', gap: 12 }}>
        <View style={styles.preview}>
          <PersonFigure person={draft} size={180} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Chip title={draft.photoUri ? '换张照片' : '用照片'} onPress={pickPhoto} />
          {draft.photoUri && <Chip title="改用小人" onPress={() => set({ photoUri: undefined })} />}
        </View>
      </Card>

      <Card>
        <Label>怎么称呼 TA</Label>
        <Field value={draft.name} onChangeText={(name) => set({ name })} placeholder="比如：小橙子" maxLength={20} />
        <View style={{ height: 14 }} />
        <Label>TA 是你的</Label>
        <View style={styles.wrap}>
          {RELATIONS.map((r) => (
            <Chip key={r} title={r} selected={draft.relation === r} onPress={() => pickRelation(r)} />
          ))}
        </View>
        <Field value={draft.relation} onChangeText={(relation) => set({ relation })} placeholder="或者自己写" style={{ marginTop: 10 }} maxLength={10} />
      </Card>

      {!draft.photoUri && (
        <Card>
          <Label>捏一个形象</Label>
          <Option title="年龄">
            {AGES.map((a) => (
              <Chip key={a.value} title={a.title} selected={draft.look.age === a.value} onPress={() => setLook({ age: a.value })} />
            ))}
          </Option>
          <Option title="发型">
            {HAIRS.map((h) => (
              <Chip key={h.value} title={h.title} selected={draft.look.hair === h.value} onPress={() => setLook({ hair: h.value })} />
            ))}
          </Option>
          <Option title="发色">
            {HAIR_COLORS.map((c) => (
              <Swatch key={c} color={c} selected={draft.look.hairColor === c} onPress={() => setLook({ hairColor: c })} />
            ))}
          </Option>
          <Option title="肤色">
            {SKINS.map((c) => (
              <Swatch key={c} color={c} selected={draft.look.skin === c} onPress={() => setLook({ skin: c })} />
            ))}
          </Option>
          <Option title="上衣">
            {CLOTH_COLORS.map((c) => (
              <Swatch key={c} color={c} selected={draft.look.top === c} onPress={() => setLook({ top: c })} />
            ))}
          </Option>
          <Option title="裤子">
            {CLOTH_COLORS.map((c) => (
              <Swatch key={c} color={c} selected={draft.look.bottom === c} onPress={() => setLook({ bottom: c })} />
            ))}
          </Option>
          <Option title="眼镜">
            <Chip title="戴" selected={draft.look.glasses} onPress={() => setLook({ glasses: true })} />
            <Chip title="不戴" selected={!draft.look.glasses} onPress={() => setLook({ glasses: false })} />
          </Option>
        </Card>
      )}

      <Card>
        <Label>关于 TA</Label>
        <Field value={draft.about} onChangeText={(about) => set({ about })} placeholder="喜好、性格、最近在忙的事……团团会参考这些给建议。" multiline />
      </Card>

      {!isNew && (
        <View style={{ alignItems: 'center' }}>
          <TextButton title={`删除${draft.name}`} color={colors.danger} onPress={remove} />
        </View>
      )}
    </Sheet>
  );
}

function Option({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.optionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {children}
      </ScrollView>
    </View>
  );
}

function Swatch({ color, selected, onPress }: { color: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.swatch, { backgroundColor: color }, selected && styles.swatchSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={color}
    />
  );
}

const styles = StyleSheet.create({
  preview: { height: 200, justifyContent: 'center', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionTitle: { fontSize: 13, color: colors.sub, marginBottom: 6, fontWeight: '600' },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.line },
  swatchSelected: { borderColor: colors.ink, borderWidth: 3 },
});
