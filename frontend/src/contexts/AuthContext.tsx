import React, { createContext, useContext, useReducer, useEffect, useRef, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData } from '@/types';
import apiService, { safeToast } from '@/services/api';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'SET_LOADING'; payload: boolean };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    default:
      return state;
  }
};

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const profileFetchedRef = useRef(false); // Prevent duplicate profile fetches (e.g., from React StrictMode)

  // Check for existing token on mount and fetch full user profile
  useEffect(() => {
    // Prevent duplicate calls (e.g., from React StrictMode in development)
    if (profileFetchedRef.current) return;
    
    const token = localStorage.getItem('token');

    if (token) {
      profileFetchedRef.current = true; // Mark as fetched
      // Fetch full user profile from API
      apiService.auth.getProfile()
        .then((response) => {
          if (response.success && response.data?.user) {
            const fullUser = response.data.user;
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: { user: fullUser, token },
            });
            // Store only id and name in localStorage for persistence
            localStorage.setItem('user', JSON.stringify({ id: fullUser.id || fullUser._id, name: fullUser.name }));
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            dispatch({ type: 'LOGIN_FAILURE' });
          }
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          dispatch({ type: 'SET_LOADING', payload: false });
        });
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      const response = await apiService.auth.login(credentials);
      
      if (response.success && response.data) {
        const { user, token } = response.data;
        
        // Store token and user in localStorage for persistence across browser sessions
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({ id: user.id || user._id, name: user.name }));
        
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user, token },
        });
        
        safeToast.success('Login successful!');
      } else {
        const errorMessage = response.message || 'Login failed';
        safeToast.error(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      
      // Show error toast if not already shown by API service
      if (error.response?.data?.message) {
        safeToast.error(error.response.data.message);
      } else if (error.message) {
        safeToast.error(error.message);
      } else {
        safeToast.error('Login failed. Please check your credentials.');
      }
      
      throw error;
    }
  };

  const register = async (userData: RegisterData) => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      const response = await apiService.auth.register(userData);
      
      if (response.success && response.data) {
        const { user, token } = response.data;
        
        // Store token and user in localStorage for persistence across browser sessions
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({ id: user.id || user._id, name: user.name }));
        
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user, token },
        });
        
        safeToast.success('Registration successful!');
      } else {
        throw new Error(response.message || 'Registration failed');
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout API to clear httpOnly cookies
      await apiService.auth.logout();
    } catch (error) {
      // Ignore logout API errors - still proceed with local cleanup
      console.warn('Logout API call failed, proceeding with local cleanup:', error);
    }
    
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Update state
    dispatch({ type: 'LOGOUT' });
    
    safeToast.success('Logged out successfully');
  };

  const loginWithToken = async (token: string): Promise<void> => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      // Store token first
      localStorage.setItem('token', token);
      
      // Fetch user profile
      const response = await apiService.auth.getProfile();
      
      if (response.success && response.data?.user) {
        const fullUser = response.data.user;
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: fullUser, token },
        });
        localStorage.setItem('user', JSON.stringify({ id: fullUser.id || fullUser._id, name: fullUser.name }));
        safeToast.success('Login successful!');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        dispatch({ type: 'LOGIN_FAILURE' });
        throw new Error('Failed to fetch user profile');
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      throw error;
    }
  };

  const updateUser = (userData: Partial<User>) => {
    if (state.user) {
      const updatedUser = { ...state.user, ...userData };
      // Update user in localStorage for persistence
      localStorage.setItem('user', JSON.stringify({ id: updatedUser.id || (updatedUser as any)._id, name: updatedUser.name }));
      dispatch({ type: 'UPDATE_USER', payload: updatedUser });
    }
  };

  const refreshProfile = React.useCallback(async () => {
    try {
      const response = await apiService.auth.getProfile();
      if (response.success && response.data?.user) {
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: response.data.user, token: state.token || '' },
        });
      }
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  }, [state.token]);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    loginWithToken,
    logout,
    updateUser,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
