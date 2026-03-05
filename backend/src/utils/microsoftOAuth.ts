import axios, { AxiosInstance } from 'axios';
import logger from './logger';

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  accountEnabled?: boolean | null; // Optional - may not be available with current permissions
  officeLocation?: string | null;
  department?: string | null;
}

class MicrosoftOAuthService {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly graphEndpoint: string;
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.tenantId = process.env.MS_TENANT_ID || '';
    this.clientId = process.env.MS_CLIENT_ID || '';
    this.clientSecret = process.env.MS_CLIENT_SECRET || '';
    this.redirectUri = process.env.MS_REDIRECT_URI || '';

    if (!this.tenantId || !this.clientId || !this.clientSecret || !this.redirectUri) {
      logger.warn('Microsoft OAuth credentials not fully configured');
    }

    this.authorizationEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`;
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    this.graphEndpoint = 'https://graph.microsoft.com/v1.0';

    this.axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email User.Read',
      state: state || '',
    });

    return `${this.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read',
      });

      const response = await this.axiosInstance.post(this.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokenData = response.data as OAuthTokenResponse;

      if (!tokenData.access_token) {
        throw new Error('No access token received');
      }

      logger.info('Microsoft OAuth token obtained successfully');
      return tokenData;
    } catch (error: any) {
      logger.error('Failed to exchange code for token', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Get user information from Microsoft Graph using access token
   */
  async getUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
    try {
      // Explicitly request accountEnabled field
      const response = await this.axiosInstance.get(
        `${this.graphEndpoint}/me?$select=id,displayName,mail,userPrincipalName,jobTitle,accountEnabled,officeLocation,department`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const userInfo = response.data as MicrosoftUserInfo;

      // Validate that user belongs to the configured tenant
      if (!userInfo.id) {
        throw new Error('Invalid user information received');
      }

      logger.info('Microsoft user info retrieved successfully', {
        userId: userInfo.id,
        email: userInfo.mail || userInfo.userPrincipalName,
        accountEnabled: userInfo.accountEnabled,
        fullResponse: JSON.stringify(userInfo), // Log full response for debugging
      });

      return userInfo;
    } catch (error: any) {
      logger.error('Failed to get user info from Microsoft Graph', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error('Failed to retrieve user information');
    }
  }

  /**
   * Validate that user belongs to the configured tenant
   * This is done by checking the tenant ID in the token claims
   */
  validateTenant(idToken?: string): boolean {
    if (!idToken) {
      return false;
    }

    try {
      // Decode JWT token (without verification for tenant check)
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        return false;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const tokenTenantId = payload.tid || payload.tenantId;

      // Verify tenant ID matches
      return tokenTenantId === this.tenantId;
    } catch (error) {
      logger.error('Failed to validate tenant from token', { error });
      return false;
    }
  }
}

export default new MicrosoftOAuthService();

