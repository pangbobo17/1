import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chineseDate, daysLabel, kindInfo, type Memory, memoryTitle, parseDate, toDateString, type Upcoming } from '../core/model';
import { colors, radius } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.primary, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button"
    >
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ title, selected, onPress }: { title: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={[styles.chipText, selected && { color: '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

export function TextButton({ title, onPress, color = colors.sub }: { title: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
      <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.sub} {...props} style={[styles.field, props.multiline && { minHeight: 100, textAlignVertical: 'top' }, props.style]} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** 从底部弹出的页面：顶部有标题和关闭按钮 */
export function Sheet({
  visible,
  title,
  onClose,
  right,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheetBar, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 14 }]}>
          <View style={{ width: 64 }}>
            <TextButton title="关闭" onPress={onClose} />
          </View>
          <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
          <View style={{ width: 64, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer && <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>{footer}</View>}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 日期选择：iOS 内嵌转轮，安卓弹系统日历 */
export function DateField({ value, onChange, maximumDate }: { value: string; onChange: (v: string) => void; maximumDate?: Date }) {
  const [open, setOpen] = useState(false);
  const date = parseDate(value);
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        maximumDate,
        onValueChange: (_e, d) => onChange(toDateString(d)),
      });
    } else {
      setOpen((o) => !o);
    }
  };
  return (
    <View>
      <Pressable onPress={press} style={styles.dateButton} accessibilityRole="button">
        <Text style={styles.dateText}>{chineseDate(date)}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.ink} />
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          locale="zh-CN"
          maximumDate={maximumDate}
          onValueChange={(_e, d) => onChange(toDateString(d))}
        />
      )}
    </View>
  );
}

export function DaysBadge({ u }: { u: Upcoming }) {
  const label = daysLabel(u);
  const m = label.match(/^(\d+) (.+)$/);
  return (
    <View style={[styles.badge, u.isPast && { backgroundColor: colors.line }]}>
      {m ? (
        <Text style={styles.badgeText}>
          <Text style={styles.badgeNumber}>{m[1]}</Text> {m[2]}
        </Text>
      ) : (
        <Text style={[styles.badgeText, { fontWeight: '800' }]}>{label}</Text>
      )}
    </View>
  );
}

export function MomentRow({ u, personName, onPress }: { u: Upcoming; personName?: string; onPress: () => void }) {
  const info = kindInfo(u.moment.kind);
  const parts = [personName, chineseDate(u.date)];
  if (u.years && u.moment.kind === 'birthday') parts.push(`${u.years} 岁`);
  if (u.years && u.moment.kind === 'anniversary') parts.push(`第 ${u.years} 年`);
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.emoji}>
        <Text style={{ fontSize: 22 }}>{info.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{u.moment.title}</Text>
        <Text style={styles.rowSub}>{parts.filter(Boolean).join(' · ')}</Text>
      </View>
      <DaysBadge u={u} />
    </Pressable>
  );
}

export function MemoryRow({ memory, onPress }: { memory: Memory; onPress: () => void }) {
  const date = memory.date ? parseDate(memory.date) : new Date(memory.createdAt);
  return (
    <Pressable onPress={onPress} style={[styles.row, { alignItems: 'flex-start' }]} accessibilityRole="button">
      <View style={styles.dot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{memoryTitle(memory)}</Text>
        <Text style={styles.rowSub}>{chineseDate(date)}</Text>
        {!!memory.title.trim() && (
          <Text style={[styles.rowSub, { marginTop: 4, color: colors.ink, opacity: 0.75 }]} numberOfLines={2}>{memory.text}</Text>
        )}
      </View>
    </Pressable>
  );
}

export function AddRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { paddingVertical: 12 }]} accessibilityRole="button">
      <Ionicons name="add-circle" size={22} color={colors.primary} />
      <Text style={[styles.rowTitle, { fontSize: 15 }]}>{title}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 16 },
  primary: { backgroundColor: colors.primary, borderRadius: radius.button, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.primarySoft },
  chipSelected: { backgroundColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  field: { backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.ink },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  dateText: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  badge: { backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  badgeNumber: { fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.sub, marginTop: 2 },
  emoji: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 8 },
});
