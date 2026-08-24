import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function NeumorphicCard({ children, onPress, style }: Props) {
  const { isDark, colors } = useTheme();
  
  // ✨ The Spring Animation Engine
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95, // Shrinks by 5% when pressed
      useNativeDriver: true,
      speed: 20,
      bounciness: 12,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1, // Springs back to normal
      useNativeDriver: true,
      speed: 20,
      bounciness: 12,
    }).start();
  };

  // ✨ Dynamic Shadow Styling resolves based on the active theme
  const shadowStyles = isDark ? styles.darkShadow : styles.lightShadow;

  return (
    <Pressable 
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
      
    >
      <Animated.View style={[
        styles.card, 
        { backgroundColor: colors.card, transform: [{ scale }] }, 
        shadowStyles,
        style
      ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    // Android needs overflow hidden for rounded corners, iOS needs visible for shadows
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible', 
    borderWidth: Platform.OS === 'android' ? 1 : 0, 
    borderColor: 'rgba(150, 150, 150, 0.05)',
  },
  
  // ✨ Soft UI Light Mode - Faint Purple Shadow (Brand Identity)
  lightShadow: Platform.select({
    web: {
      boxShadow: '6px 6px 14px #d9d9ea, -6px -6px 14px #ffffff',
    } as any,
    default: {
      shadowColor: '#4F46E5', // Brand Purple Tint
      shadowOffset: { width: 4, height: 6 },
      shadowOpacity: 0.15,    // Low opacity glow
      shadowRadius: 10,
      elevation: 4,
    }
  }),
  
  // ✨ Deep Dark Mode - Subtle Neon Purple Glow
  darkShadow: Platform.select({
    web: {
      boxShadow: '6px 6px 14px #05030a, -6px -6px 14px #171224',
    } as any,
    default: {
      shadowColor: '#6366F1', // Light Indigo/Purple
      shadowOffset: { width: 4, height: 8 },
      shadowOpacity: 0.20,    // Faint neon glow effect
      shadowRadius: 12,
      elevation: 8,
    }
  })
});