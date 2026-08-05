import React, { createContext, useContext, useState } from 'react';

type ThemeContextType = {
  isDark: boolean;
  colors: any;
  toggleTheme: () => void; // ✨ Make sure toggleTheme is declared here
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
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
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};