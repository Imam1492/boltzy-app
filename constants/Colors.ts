// constants/Colors.ts

// Boltzy Official Brand Colors
const INDIGO_NAVY = '#0F172A';
const INDIGO_VIOLET = '#4F46E5';
const SLATE_GRAY = '#64748B';

export const Colors = {
  light: {
    text: INDIGO_NAVY,           // Primary text is Navy, not pure black
    textSecondary: SLATE_GRAY,   // Subtitles and hints
    background: '#ffffff',
    backgroundSecondary: '#f8f9fa', // Very light gray for search bars/cards
    tint: INDIGO_VIOLET,         // The main accent color for buttons/active states
    border: '#e2e8f0',
    card: '#ffffff',
    primary: INDIGO_VIOLET,
    error: '#FF3B30',
    success: '#34C759',
    warning: '#F5A623',          // Keeping gold for premium badges
  },
  dark: {
    text: '#ffffff',
    textSecondary: '#94A3B8',    // Lighter slate for readability on dark
    background: INDIGO_NAVY,     // Brand Navy background instead of harsh black
    backgroundSecondary: '#1E293B', // Slightly lighter navy for cards
    tint: '#6366F1',             // Slightly brighter violet for dark mode contrast
    border: '#334155',
    card: '#1E293B',
    primary: '#6366F1',
    error: '#FF453A',
    success: '#32D74B',
    warning: '#FFD60A',
  },
};