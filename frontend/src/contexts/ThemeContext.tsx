import React, { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react';
import { ThemeContextType } from '@/types';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Get initial theme from localStorage, default to light
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
      // Default to light if no saved preference
      return 'light';
    }
    return 'light';
  });

  const applyThemeToDOM = (t: 'light' | 'dark') => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    const body = document.body;
    
    if (t === 'dark') {
      root.classList.add('dark');
      if (body) {
        body.classList.add('dark');
      }
    } else {
      root.classList.remove('dark');
      if (body) {
        body.classList.remove('dark');
      }
    }
  };

  // Apply immediately on mount to avoid a flash and ensure state matches DOM
  useLayoutEffect(() => {
    applyThemeToDOM(theme);
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      // Apply immediately for instant feedback
      applyThemeToDOM(newTheme);
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newTheme);
      }
      return newTheme;
    });
  };

  const value: ThemeContextType = {
    theme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
