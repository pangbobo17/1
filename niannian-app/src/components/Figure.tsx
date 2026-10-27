import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Look, Person } from '../core/model';
import { colors } from '../theme';

/** 软软的小人：圆头、短身体，用渐变做出一点立体感 */
export function LookFigure({ look, size = 200 }: { look: Look; size?: number }) {
  const kid = look.age === 'kid';
  const elder = look.age === 'elder';
  // 小孩头更大、身体更短
  const headR = kid ? 34 : 30;
  const headY = kid ? 52 : 46;
  const bodyTop = headY + headR - 6;
  const bodyH = kid ? 44 : 54;
  const legH = kid ? 26 : 34;
  const hair = look.hairColor;

  return (
    <Svg width={size * 0.75} height={size} viewBox="0 0 120 160">
      <Defs>
        <RadialGradient id="skin" cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={look.skin} stopOpacity="1" />
          <Stop offset="1" stopColor={look.skin} stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="top" cx="30%" cy="15%" r="90%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.18" />
          <Stop offset="0.35" stopColor={look.top} stopOpacity="1" />
        </RadialGradient>
      </Defs>

      {/* 影子 */}
      <Ellipse cx="60" cy="154" rx="30" ry="5" fill={colors.ink} opacity={0.08} />

      {/* 腿和鞋 */}
      <Rect x="44" y={bodyTop + bodyH - 6} width="13" height={legH} rx="6" fill={look.bottom} />
      <Rect x="63" y={bodyTop + bodyH - 6} width="13" height={legH} rx="6" fill={look.bottom} />
      <Ellipse cx="50" cy={bodyTop + bodyH + legH - 4} rx="9" ry="5" fill={colors.ink} opacity={0.85} />
      <Ellipse cx="70" cy={bodyTop + bodyH + legH - 4} rx="9" ry="5" fill={colors.ink} opacity={0.85} />

      {/* 胳膊 */}
      <Rect x="24" y={bodyTop + 6} width="12" height={bodyH - 10} rx="6" fill={look.top} transform={`rotate(12 30 ${bodyTop + 6})`} />
      <Rect x="84" y={bodyTop + 6} width="12" height={bodyH - 10} rx="6" fill={look.top} transform={`rotate(-12 90 ${bodyTop + 6})`} />
      <Circle cx="27" cy={bodyTop + bodyH - 2} r="6" fill={look.skin} />
      <Circle cx="93" cy={bodyTop + bodyH - 2} r="6" fill={look.skin} />

      {/* 身体 */}
      <Path
        d={`M34 ${bodyTop + 14} Q34 ${bodyTop} 50 ${bodyTop} L70 ${bodyTop} Q86 ${bodyTop} 86 ${bodyTop + 14} L88 ${bodyTop + bodyH} Q60 ${bodyTop + bodyH + 6} 32 ${bodyTop + bodyH} Z`}
        fill="url(#top)"
      />

      {/* 长发在脑后 */}
      {look.hair === 'long' && <Path d={`M${60 - headR - 2} ${headY} Q${60 - headR - 4} ${headY + headR + 22} ${60 - headR + 8} ${headY + headR + 18} L${60 + headR - 8} ${headY + headR + 18} Q${60 + headR + 4} ${headY + headR + 22} ${60 + headR + 2} ${headY} Z`} fill={hair} />}

      {/* 头 */}
      <Circle cx="60" cy={headY} r={headR} fill="url(#skin)" />
      <Ellipse cx={60 - headR + 1} cy={headY + 2} rx="4" ry="6" fill={look.skin} />
      <Ellipse cx={60 + headR - 1} cy={headY + 2} rx="4" ry="6" fill={look.skin} />

      {/* 头发 */}
      {look.hair === 'short' && <Path d={`M${60 - headR} ${headY - 2} Q${60 - headR + 2} ${headY - headR - 6} 60 ${headY - headR - 4} Q${60 + headR - 2} ${headY - headR - 6} ${60 + headR} ${headY - 2} Q${60 + 10} ${headY - headR + 10} ${60 - headR} ${headY - 2} Z`} fill={hair} />}
      {(look.hair === 'long' || look.hair === 'bun') && <Path d={`M${60 - headR} ${headY + 2} Q${60 - headR} ${headY - headR - 4} 60 ${headY - headR - 3} Q${60 + headR} ${headY - headR - 4} ${60 + headR} ${headY + 2} Q${60 + headR - 6} ${headY - headR + 12} 60 ${headY - headR + 10} Q${60 - headR + 6} ${headY - headR + 12} ${60 - headR} ${headY + 2} Z`} fill={hair} />}
      {look.hair === 'bun' && <Circle cx="60" cy={headY - headR - 6} r="10" fill={hair} />}
      {look.hair === 'curly' && (
        <G fill={hair}>
          {[-24, -14, -4, 6, 16, 26].map((dx, i) => (
            <Circle key={i} cx={60 + dx * (headR / 30)} cy={headY - headR + 4 + (Math.abs(dx) > 20 ? 8 : 0)} r="9" />
          ))}
        </G>
      )}

      {/* 脸 */}
      <Circle cx="50" cy={headY + 4} r="3" fill={colors.ink} />
      <Circle cx="70" cy={headY + 4} r="3" fill={colors.ink} />
      <Circle cx="51" cy={headY + 3} r="1" fill="#FFFFFF" />
      <Circle cx="71" cy={headY + 3} r="1" fill="#FFFFFF" />
      <Ellipse cx="44" cy={headY + 12} rx="5" ry="3" fill="#FF8A8A" opacity={0.45} />
      <Ellipse cx="76" cy={headY + 12} rx="5" ry="3" fill="#FF8A8A" opacity={0.45} />
      <Path d={`M55 ${headY + 13} Q60 ${headY + 18} 65 ${headY + 13}`} stroke={colors.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
      {elder && <Path d={`M44 ${headY - 8} L54 ${headY - 9} M66 ${headY - 9} L76 ${headY - 8}`} stroke={colors.ink} strokeWidth="1.2" opacity={0.4} />}
      {look.glasses && (
        <G stroke={colors.ink} strokeWidth="1.8" fill="none">
          <Circle cx="50" cy={headY + 4} r="7" />
          <Circle cx="70" cy={headY + 4} r="7" />
          <Path d={`M57 ${headY + 4} L63 ${headY + 4}`} />
        </G>
      )}
    </Svg>
  );
}

/** 人物形象：有照片用照片（圆角框），否则画小人 */
export function PersonFigure({ person, size = 200 }: { person: Person; size?: number }) {
  if (person.photoUri) {
    return (
      <View style={[styles.photoFrame, { width: size * 0.78, height: size, borderRadius: size * 0.2 }]}>
        <Image source={{ uri: person.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </View>
    );
  }
  return <LookFigure look={person.look} size={size} />;
}

/** 首页的大形象：轻轻上下浮动，点一下会蹦一下 */
export function LivelyFigure({ person, size }: { person: Person; size: number }) {
  const float = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const onPress = () => {
    hop.setValue(0);
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(hop, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const translateY = Animated.add(
    float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
    hop.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }),
  );
  const scaleY = float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });

  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`${person.name}的形象`}>
      <Animated.View style={{ transform: [{ translateY }, { scaleY }] }}>
        <PersonFigure person={person} size={size} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photoFrame: { overflow: 'hidden', borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: colors.primarySoft },
});
