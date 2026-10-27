import { useEffect, useState } from 'react';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

/** 吉祥物“团团”：圆滚滚的杏子团子，头顶一片叶子，会眨眼 */
export function Mascot({ size = 64 }: { size?: number }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2500 + Math.random() * 2500);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="apricot" cx="38%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#FFD2B0" />
          <Stop offset="0.6" stopColor={colors.primary} />
          <Stop offset="1" stopColor="#E86F43" />
        </RadialGradient>
      </Defs>
      <Path d="M50 22 Q48 12 54 6" stroke="#7A5A3A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M54 10 Q70 2 76 14 Q62 20 54 10 Z" fill="#7BC8A4" />
      <Ellipse cx="50" cy="58" rx="40" ry="37" fill="url(#apricot)" />
      <Path d="M50 24 Q46 58 50 94" stroke="#E86F43" strokeWidth="1.5" fill="none" opacity={0.35} />
      {blink ? (
        <>
          <Path d="M32 56 Q37 59 42 56" stroke={colors.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M58 56 Q63 59 68 56" stroke={colors.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx="37" cy="55" r="5" fill={colors.ink} />
          <Circle cx="63" cy="55" r="5" fill={colors.ink} />
          <Circle cx="38.5" cy="53.5" r="1.6" fill="#FFFFFF" />
          <Circle cx="64.5" cy="53.5" r="1.6" fill="#FFFFFF" />
        </>
      )}
      <Ellipse cx="27" cy="66" rx="6" ry="3.5" fill="#FF5E7A" opacity={0.35} />
      <Ellipse cx="73" cy="66" rx="6" ry="3.5" fill="#FF5E7A" opacity={0.35} />
      <Path d="M45 66 Q50 71 55 66" stroke={colors.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Svg>
  );
}
