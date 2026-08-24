import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextType = {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: any;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // ✨ Detects device setting ('light' or 'dark')
  const systemColorScheme = useColorScheme(); 
  
  // ✨ Defaults to 'system'
  const [themeMode, setMode] = useState<ThemeMode>('system'); 

  // 🚀 1. Load the saved theme instantly when the app opens
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@boltzy_theme');
        if (savedTheme) {
          setMode(savedTheme as ThemeMode);
        }
      } catch (e) {
        console.error('Failed to load theme:', e);
      }
    };
    loadTheme();
  }, []);

  // 🚀 2. Save the theme to the phone's memory every time you change it
  const setThemeMode = async (mode: ThemeMode) => {
    setMode(mode);
    try {
      await AsyncStorage.setItem('@boltzy_theme', mode);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  // ✨ Resolves active mode based on choice
  const isDark = themeMode === 'system' 
    ? systemColorScheme === 'dark' 
    : themeMode === 'dark';

  const toggleTheme = async () => {
    const newTheme = isDark ? 'light' : 'dark';
    setMode(newTheme);
    try {
      await AsyncStorage.setItem('@boltzy_theme', newTheme);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  };

  const colors = isDark
    ? {
        background: '#020617',
        card: '#0F172A',
        backgroundSecondary: '#1E293B',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: '#334155',
        tint: '#6366F1',
      }
    : {
        background: '#F8FAFC',
        card: '#FFFFFF',
        backgroundSecondary: '#F1F5F9',
        text: '#0F172A',
        textSecondary: '#64748B',
        border: '#E2E8F0',
        tint: '#4F46E5',
      };

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, colors, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};