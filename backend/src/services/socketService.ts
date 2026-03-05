import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../utils/jwt';
import User from '../models/User';
import logger from '../utils/logger';

// Socket event types for type safety
export interface InquiryForwardedPayload {
  inquiryId: string;
  department: 'sales';
  location?: string;
  timestamp: string;
}

export interface BadgeUpdatePayload {
  type: 'increment' | 'decrement' | 'refresh';
  department?: string;
  location?: string;
  count?: number;
}

// Store connected users by their user ID for targeted notifications
const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

let io: SocketServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:5173'
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping timeout and interval for connection health
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        logger.warn('Socket connection attempted without token');
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');

      if (!user || !user.isActive) {
        logger.warn(`Socket auth failed: User not found or inactive - ${decoded.userId}`);
        return next(new Error('User not found or inactive'));
      }

      // Attach user info to socket
      socket.data.user = {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
      };

      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.id;
    const userRole = socket.data.user?.role;
    
    if (userId) {
      // Track connected user
      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }
      connectedUsers.get(userId)!.add(socket.id);

      // Join role-based rooms for targeted broadcasts
      socket.join(`role:${userRole}`);
      socket.join(`user:${userId}`);
      
      logger.info(`Socket connected: ${socket.id} | User: ${socket.data.user?.name} (${userRole})`);
    }

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      if (userId) {
        const userSockets = connectedUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            connectedUsers.delete(userId);
          }
        }
      }
      logger.info(`Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
};

export const getIO = (): SocketServer | null => io;

// Emit inquiry forwarded to sales event
// This notifies all sales users and admins that a new inquiry is available
export const emitInquiryForwardedToSales = (payload: InquiryForwardedPayload): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit event');
    return;
  }

  // Emit to sales users
  io.to('role:sales').emit('inquiry:forwarded', payload);
  
  // Emit to admin users
  io.to('role:admin').emit('inquiry:forwarded', payload);

  logger.info(`Emitted inquiry:forwarded event for inquiry ${payload.inquiryId}`);
};

// Emit badge update event
// This tells clients to refresh their unattended counts
export const emitBadgeUpdate = (payload: BadgeUpdatePayload): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit badge update');
    return;
  }

  // Broadcast to all connected clients (badges are visible to all users)
  io.emit('badge:update', payload);

  logger.info('Emitted badge:update event');
};

// Emit to specific user by ID
export const emitToUser = (userId: string, event: string, payload: any): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to user');
    return;
  }

  io.to(`user:${userId}`).emit(event, payload);
  logger.info(`Emitted ${event} to user ${userId}`);
};

// Emit to specific role
export const emitToRole = (role: string, event: string, payload: any): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to role');
    return;
  }

  io.to(`role:${role}`).emit(event, payload);
  logger.info(`Emitted ${event} to role ${role}`);
};

// Get count of connected users
export const getConnectedUsersCount = (): number => {
  return connectedUsers.size;
};

// Check if a specific user is connected
export const isUserConnected = (userId: string): boolean => {
  return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
};

// ============================================
// ADDITIONAL REAL-TIME EVENT EMITTERS
// ============================================

// Emit to all connected users
export const emitToAll = (event: string, payload: any): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to all');
    return;
  }

  io.emit(event, payload);
  logger.info(`Emitted ${event} to all users`);
};

// Emit options update to all users
export const emitOptionsUpdate = (type: string, data: any): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit options update');
    return;
  }

  io.emit('options:updated', { type, data, timestamp: new Date() });
  logger.info(`Emitted options:updated for type ${type}`);
};

// Emit dashboard refresh to specific role
export const emitDashboardRefresh = (role: string, section?: string): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit dashboard refresh');
    return;
  }

  io.to(`role:${role}`).emit('dashboard:refresh', { section, timestamp: new Date() });
  logger.info(`Emitted dashboard:refresh to role ${role}`);
};

// Emit inquiry operation to relevant users
export const emitInquiryOperation = (
  operation: 'created' | 'updated' | 'deleted' | 'assigned',
  inquiry: any,
  targetUsers?: string[]
): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit inquiry operation');
    return;
  }

  // Emit to specific users if provided
  if (targetUsers && targetUsers.length > 0) {
    targetUsers.forEach(userId => {
      io!.to(`user:${userId}`).emit(`inquiry:${operation}`, inquiry);
    });
  }

  // Always emit to admin
  io!.to('role:admin').emit(`inquiry:${operation}`, inquiry);

  // Emit to department
  if (inquiry.department) {
    io!.to(`role:${inquiry.department}`).emit(`inquiry:${operation}`, inquiry);
  }

  logger.info(`Emitted inquiry:${operation} for inquiry ${inquiry._id || inquiry.inquiryId}`);
};

// Emit user operation (for admin user management)
export const emitUserOperation = (
  operation: 'created' | 'updated' | 'deleted',
  user: any
): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit user operation');
    return;
  }

  // Emit to all users (so they see updated user lists)
  io.emit(`user:${operation}`, user);

  // Also emit specifically to the affected user
  if (operation === 'updated' && user._id) {
    io.to(`user:${user._id}`).emit('profile:updated', user);
  }

  logger.info(`Emitted user:${operation} for user ${user._id || user.email}`);
};

// Emit notification to specific user
export const emitNotification = (
  userId: string,
  notification: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    action?: { label: string; link: string };
  }
): void => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit notification');
    return;
  }

  io.to(`user:${userId}`).emit('notification', {
    ...notification,
    timestamp: new Date()
  });

  logger.info(`Emitted notification to user ${userId}: ${notification.title}`);
};
