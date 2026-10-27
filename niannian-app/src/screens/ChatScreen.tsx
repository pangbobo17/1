import { Ionicons } from '@expo/vector-icons';
import type Anthropic from '@anthropic-ai/sdk';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Navigate } from '../../App';
import { chat, describeError } from '../ai';
import { chatSuggestions, newId, offlineReply } from '../core/model';
import { Mascot } from '../components/Mascot';
import { TextButton } from '../components/ui';
import { useStore } from '../store';
import { colors } from '../theme';

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** 出错的提示不进对话历史 */
  error?: boolean;
}

/** 问问团团：根据记录聊聊 TA */
export function ChatScreen({ personId, navigate, onClose }: { personId: string; navigate: Navigate; onClose: () => void }) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const person = store.library.people.find((p) => p.id === personId);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  if (!person) return null;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    const next: Bubble[] = [...messages, { id: newId(), role: 'user', text }];
    setMessages(next);
    if (!store.apiKey) {
      setMessages([...next, { id: newId(), role: 'assistant', text: offlineReply(text, person, store.library) }]);
      return;
    }
    setBusy(true);
    try {
      const history: Anthropic.MessageParam[] = next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text }));
      const reply = await chat(store.apiKey, person, store.library, history);
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text: reply }]);
    } catch (e) {
      // 失败的那条问题也拿掉，免得历史里出现两个连续的用户消息
      setMessages((m) => [...m.slice(0, -1), { id: newId(), role: 'user', text, error: true }, { id: newId(), role: 'assistant', text: describeError(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const keep = (text: string) => {
    store.saveMemory({ id: newId(), personId, title: '团团的建议', text, date: null, createdAt: new Date().toISOString() });
    store.show('已记进小事');
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.bar, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 14 }]}>
          <View style={{ width: 64 }}>
            <TextButton title="关闭" onPress={onClose} />
          </View>
          <Text style={styles.barTitle}>问问团团</Text>
          <View style={{ width: 64, alignItems: 'flex-end' }}>
            {!store.apiKey && <TextButton title="设置" color={colors.primary} onPress={() => navigate({ name: 'ai' })} />}
          </View>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 14 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          <View style={styles.assistantRow}>
            <Mascot size={44} />
            <View style={[styles.bubble, styles.assistantBubble]}>
              <Text style={styles.bubbleText}>
                我看过你记下的关于{person.name}的事啦。想聊聊 TA 最近的状态，还是要送礼建议？
                {!store.apiKey ? '\n\n（现在是离线模式，只能简单回顾和推荐。填上 API Key 后能好好聊。）' : ''}
              </Text>
            </View>
          </View>

          {messages.length === 0 && (
            <View style={styles.suggestions}>
              {chatSuggestions(person, store.library).map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={styles.suggestion} accessibilityRole="button">
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.bubbleText}>{m.text}</Text>
              </View>
            ) : (
              <View key={m.id} style={styles.assistantRow}>
                <Mascot size={32} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.bubble, styles.assistantBubble, m.error && { backgroundColor: colors.line }]}>
                    <Text style={styles.bubbleText} selectable>{m.text}</Text>
                  </View>
                  {!m.error && (
                    <Pressable onPress={() => keep(m.text)} style={styles.keep} accessibilityRole="button">
                      <Ionicons name="bookmark-outline" size={14} color={colors.ink} />
                      <Text style={styles.keepText}>记一笔</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ),
          )}

          {busy && (
            <View style={styles.assistantRow}>
              <Mascot size={32} />
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.sub }}>团团在想…</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="问问关于 TA 的事…"
            placeholderTextColor={colors.sub}
            style={styles.input}
            multiline
            maxLength={500}
          />
          <Pressable onPress={() => send(input)} disabled={!input.trim() || busy} style={[styles.send, (!input.trim() || busy) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="发送">
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '86%' },
  assistantBubble: { backgroundColor: colors.card, flexShrink: 1 },
  userBubble: { backgroundColor: colors.primarySoft, alignSelf: 'flex-end' },
  bubbleText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  suggestions: { gap: 8, paddingLeft: 52 },
  suggestion: { alignSelf: 'flex-start', backgroundColor: colors.mint, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionText: { color: colors.ink, fontWeight: '600' },
  keep: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.card, borderRadius: 999 },
  keepText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg },
  input: { flex: 1, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, maxHeight: 120, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
