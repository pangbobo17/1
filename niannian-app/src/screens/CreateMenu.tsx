import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Navigate } from '../../App';
import { currentPerson } from '../core/model';
import { useStore } from '../store';
import { colors } from '../theme';

/** 点“+”弹出的选择 */
export function CreateMenu({ navigate, onClose }: { navigate: Navigate; onClose: () => void }) {
  const { library } = useStore();
  const insets = useSafeAreaInsets();
  const person = currentPerson(library);

  const options: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; go: () => void }[] = [];
  if (person) {
    options.push(
      { icon: 'create-outline', title: '记一件小事', sub: `关于${person.name}，一两句话就好`, go: () => navigate({ name: 'memory', personId: person.id }) },
      { icon: 'calendar-outline', title: '添加重要日子', sub: '生日、纪念日、考试……', go: () => navigate({ name: 'moment', personId: person.id }) },
    );
  }
  options.push({ icon: 'person-add-outline', title: '添加在意的人', sub: '家人、朋友，给 TA 捏个形象', go: () => navigate({ name: 'person' }) });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭">
        <Pressable style={[styles.panel, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={styles.handle} />
          {options.map((o) => (
            <Pressable key={o.title} onPress={o.go} style={styles.option} accessibilityRole="button">
              <View style={styles.icon}>
                <Ionicons name={o.icon} size={22} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{o.title}</Text>
                <Text style={styles.sub}>{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.sub} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(46,36,64,0.35)', justifyContent: 'flex-end' },
  panel: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 20, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.sub, marginTop: 2 },
});
