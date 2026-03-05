import { Response } from 'express';

export class CookieManager {
  private static readonly TOKEN_COOKIE_NAME = 'auth_token';
  private static readonly REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
  
  /**
   * Set secure authentication cookie
   */
  static setAuthCookie(res: Response, token: string, maxAge: number = 3 * 24 * 60 * 60 * 1000): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie(this.TOKEN_COOKIE_NAME, token, {
      httpOnly: true, // Prevents XSS attacks
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
      maxAge: maxAge, // 3 days by default
      path: '/', // Available for all routes
    });
  }

  /**
   * Clear authentication cookie
   */
  static clearAuthCookie(res: Response): void {
    res.clearCookie(this.TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });
  }

  /**
   * Get token from cookie
   */
  static getTokenFromCookie(req: any): string | null {
    return req.cookies?.[this.TOKEN_COOKIE_NAME] || null;
  }

  /**
   * Set refresh token cookie (for future implementation)
   */
  static setRefreshCookie(res: Response, refreshToken: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie(this.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: maxAge, // 7 days by default
      path: '/api/auth', // Only available for auth routes
    });
  }

  /**
   * Clear refresh token cookie
   */
  static clearRefreshCookie(res: Response): void {
    res.clearCookie(this.REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/api/auth',
    });
  }
}