import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useQueryClient } from 'react-query';

const REFRESH_DEBOUNCE_MS = 2000; // Batch rapid socket events into one refresh

// Socket event payload types
interface InquiryForwardedPayload {
  inquiryId: string;
  department: 'sales';
  location?: string;
  timestamp: string;
}

interface BadgeUpdatePayload {
  type: 'increment' | 'decrement' | 'refresh';
  department?: string;
  location?: string;
  count?: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastInquiryEvent: InquiryForwardedPayload | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

// Get Socket URL with fallback, but validate it
const getSocketUrl = (): string | undefined => {
  const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  try {
    // Basic URL validation
    new URL(url);
    return url;
  } catch (error) {
    console.warn('[Socket] Invalid Socket URL:', url, '- Socket.IO will not connect');
    return undefined;
  }
};

const SOCKET_URL = getSocketUrl();

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastInquiryEvent, setLastInquiryEvent] = useState<InquiryForwardedPayload | null>(null);

  // Targeted invalidation: only refresh what changed. Uses predicates for 2–3 calls instead of 14.
  // unattended-counts excluded (uses 60s polling in Sidebar).
  const INQUIRY_KEYS = ['inquiries', 'sales-inquiries', 'presales-inquiries', 'center-inquiries', 'sales-assigned', 'presales-assigned', 'my-inquiries', 'center-all-inquiries', 'conversions', 'my-follow-ups', 'sales-my-follow-ups', 'admitted-students'];
  const DASHBOARD_KEYS = ['dashboard-stats', 'admin-dashboard-overview', 'sales-dashboard-stats', 'presales-dashboard-stats', 'center-dashboard-stats'];
  const REPORT_KEYS = ['sales-report', 'presales-report'];

  const invalidateByPredicate = useCallback((keys: string[]) => {
    queryClient.invalidateQueries({
      predicate: (query) => typeof query.queryKey[0] === 'string' && keys.includes(query.queryKey[0]),
    });
  }, [queryClient]);

  // inquiry:forwarded – inquiry moved; invalidate lists, dashboards, reports
  const refreshOnInquiryForwarded = useCallback(() => {
    invalidateByPredicate(INQUIRY_KEYS);
    invalidateByPredicate(DASHBOARD_KEYS);
    invalidateByPredicate(REPORT_KEYS);
  }, [invalidateByPredicate]);

  // badge:update / dashboard:refresh – counts changed; dashboards only (unattended-counts uses polling)
  const refreshOnBadgeOrDashboard = useCallback(() => {
    invalidateByPredicate(DASHBOARD_KEYS);
  }, [invalidateByPredicate]);

  // Debounced refresh: batch rapid socket events into one invalidation
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasForwardedRef = useRef(false);

  const debouncedRefresh = useCallback((eventType: 'forwarded' | 'badge' | 'dashboard') => {
    if (eventType === 'forwarded') hasForwardedRef.current = true;
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      try {
        // If any inquiry:forwarded occurred, do full refresh; else minimal (dashboards only)
        if (hasForwardedRef.current) {
          hasForwardedRef.current = false;
          refreshOnInquiryForwarded();
        } else if (eventType === 'badge' || eventType === 'dashboard') {
          refreshOnBadgeOrDashboard();
        }
      } catch (e) {
        console.warn('[Socket] Error refreshing:', e);
      }
    }, REFRESH_DEBOUNCE_MS);
  }, [refreshOnInquiryForwarded, refreshOnBadgeOrDashboard]);

  // Connect to socket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !token) {
      // Disconnect if not authenticated
      if (socket) {
        try {
          socket.disconnect();
        } catch (error) {
          // Silently handle disconnect errors
        }
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // If Socket URL is invalid, skip connection attempt
    if (!SOCKET_URL) {
      console.warn('[Socket] Socket URL is invalid. App will continue without Socket.IO.');
      setSocket(null);
      setIsConnected(false);
      return;
    }

    let newSocket: Socket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3; // Reduced from 5 to fail faster
    let isManuallyDisconnected = false;

    try {
      // Create socket connection with auth token
      newSocket = io(SOCKET_URL, {
        auth: {
          token: token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
        timeout: 10000, // 10 second connection timeout
        autoConnect: true,
      });

      // Connection events - wrapped in try-catch to prevent errors from breaking the app
      newSocket.on('connect', () => {
        try {
          console.log('[Socket] Connected:', newSocket?.id);
          setIsConnected(true);
          reconnectAttempts = 0; // Reset on successful connection
        } catch (error) {
          // Silently handle any errors in connection handler
          console.warn('[Socket] Error in connect handler:', error);
        }
      });

      newSocket.on('disconnect', (reason) => {
        try {
          // Only log disconnect if not manually disconnected
          if (!isManuallyDisconnected) {
            console.log('[Socket] Disconnected:', reason);
          }
          setIsConnected(false);
        } catch (error) {
          // Silently handle any errors in disconnect handler
          console.warn('[Socket] Error in disconnect handler:', error);
        }
      });

      newSocket.on('connect_error', (_error) => {
        try {
          reconnectAttempts++;
          // Silently log connection errors - no user notification needed
          setIsConnected(false);
          
          // NO TOAST MESSAGES - App works fine without socket
          // Users don't need to know about socket connection issues
          
          // Stop reconnection attempts after max attempts
          if (reconnectAttempts >= maxReconnectAttempts && newSocket) {
            try {
              newSocket.disconnect();
            } catch (disconnectError) {
              // Silently handle disconnect errors
            }
            setSocket(null);
            setIsConnected(false);
          }
        } catch (handlerError) {
          // Silently handle any errors in error handler
          console.warn('[Socket] Error in connect_error handler:', handlerError);
        }
      });

      // Handle reconnection attempts
    

      // Handle reconnection failures
      newSocket.on('reconnect_failed', () => {
        try {
          setIsConnected(false);
          
          // NO TOAST MESSAGES - Silent fallback
          // The app works perfectly fine without socket connection
          
          if (newSocket) {
            try {
              newSocket.disconnect();
            } catch (disconnectError) {
              // Silently handle disconnect errors
            }
            setSocket(null);
          }
        } catch (error) {
          // Silently handle any errors
          console.warn('[Socket] Error in reconnect_failed handler:', error);
        }
      });

      // Listen for inquiry forwarded events - debounced, targeted invalidation
      newSocket.on('inquiry:forwarded', (payload: InquiryForwardedPayload) => {
        try {
          setLastInquiryEvent(payload);
          debouncedRefresh('forwarded');
        } catch (error) {
          console.warn('[Socket] Error in inquiry:forwarded handler:', error);
        }
      });

      // Listen for badge update events
      newSocket.on('badge:update', (_payload: BadgeUpdatePayload) => {
        try {
          debouncedRefresh('badge');
        } catch (error) {
          console.warn('[Socket] Error in badge:update handler:', error);
        }
      });

      // Listen for dashboard refresh
      newSocket.on('dashboard:refresh', () => {
        try {
          debouncedRefresh('dashboard');
        } catch (error) {
          console.warn('[Socket] Error in dashboard:refresh handler:', error);
        }
      });

      // Handle any other socket errors
      newSocket.on('error', (error) => {
        try {
          // Silently log errors without showing toasts
          console.warn('[Socket] Socket error:', error);
        } catch (handlerError) {
          // Silently handle any errors in error handler
        }
      });

      setSocket(newSocket);
    } catch (error) {
      // If socket initialization fails, silently handle it and continue without Socket.IO
      console.warn('[Socket] Failed to initialize Socket.IO. App will continue without real-time updates:', error);
      setSocket(null);
      setIsConnected(false);
    }

    // Cleanup on unmount or when auth changes
    return () => {
      isManuallyDisconnected = true;
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      if (newSocket) {
        try {
          newSocket.removeAllListeners();
          newSocket.disconnect();
        } catch (error) {
          // Silently handle cleanup errors
        }
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, token, queryClient, debouncedRefresh]);

  const value: SocketContextType = {
    socket,
    isConnected,
    lastInquiryEvent,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Custom hook to subscribe to specific socket events
export const useSocketEvent = <T,>(
  eventName: string,
  callback: (data: T) => void,
  deps: React.DependencyList = []
) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Wrap callback in error handler to prevent errors from breaking the app
    const safeCallback = (data: T) => {
      try {
        callback(data);
      } catch (error) {
        // Silently handle errors in event callbacks
        console.warn(`[Socket] Error in ${eventName} event handler:`, error);
      }
    };

    try {
      socket.on(eventName, safeCallback);
    } catch (error) {
      // Silently handle errors when adding event listener
      console.warn(`[Socket] Error adding ${eventName} listener:`, error);
    }

    return () => {
      try {
        socket.off(eventName, safeCallback);
      } catch (error) {
        // Silently handle errors when removing event listener
        console.warn(`[Socket] Error removing ${eventName} listener:`, error);
      }
    };
  }, [socket, isConnected, eventName, ...deps]);
};
