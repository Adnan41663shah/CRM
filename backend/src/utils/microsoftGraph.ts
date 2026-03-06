import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { URLSearchParams } from 'node:url';
import logger from './logger';

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  accountEnabled: boolean;
}

interface GraphUsersResponse {
  value: GraphUser[];
  '@odata.nextLink'?: string;
}

interface NormalizedUser {
  id: string;
  name: string;
  email: string;
  upn: string;
  designation: string;
  status: 'active' | 'inactive';
}

class MicrosoftGraphService {
  private tokenCache: TokenCache | null = null;
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenEndpoint: string;
  private readonly graphEndpoint: string;
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.tenantId = process.env.MS_TENANT_ID || '';
    this.clientId = process.env.MS_CLIENT_ID || '';
    this.clientSecret = process.env.MS_CLIENT_SECRET || '';

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      logger.warn('Microsoft Graph credentials not configured');
    }

    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    this.graphEndpoint = 'https://graph.microsoft.com/v1.0';

    this.axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Get access token using client credentials flow
   * Caches token until expiry (1 hour)
   */
  private async getAccessToken(): Promise<string> {
    // Check if cached token is still valid (with 5 minute buffer)
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
      return this.tokenCache.token;
    }

    try {
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('grant_type', 'client_credentials');

      const response = await this.axiosInstance.post(this.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in } = response.data;

      if (!access_token) {
        throw new Error('No access token received');
      }

      // Cache token (expires_in is in seconds, convert to milliseconds)
      const expiresInMs = (expires_in || 3600) * 1000;
      this.tokenCache = {
        token: access_token,
        expiresAt: Date.now() + expiresInMs,
      };

      logger.info('Microsoft Graph access token obtained successfully');
      return access_token;
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { status?: number } };
      logger.error('Failed to obtain Microsoft Graph access token', {
        error: err.message,
        status: err.response?.status,
      });
      throw new Error('Authentication failed: Unable to obtain access token');
    }
  }

  /**
   * Fetch all users from Microsoft Graph with pagination
   */
  async fetchUsers(): Promise<NormalizedUser[]> {
    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error('Microsoft Graph credentials not configured');
    }

    try {
      const accessToken = await this.getAccessToken();
      const allUsers: GraphUser[] = [];
      let nextLink: string | undefined = `${this.graphEndpoint}/users?$filter=accountEnabled eq true&$select=id,displayName,mail,userPrincipalName,jobTitle,accountEnabled`;

      // Handle pagination
      while (nextLink) {
        const response: AxiosResponse<GraphUsersResponse> = await this.axiosInstance.get<GraphUsersResponse>(nextLink, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.data.value) {
          allUsers.push(...response.data.value);
        }

        nextLink = response.data['@odata.nextLink'];
      }

      // Normalize users
      const normalizedUsers: NormalizedUser[] = allUsers.map((user) => ({
        id: user.id,
        name: user.displayName || user.userPrincipalName,
        email: user.mail || user.userPrincipalName,
        upn: user.userPrincipalName,
        designation: user.jobTitle || 'N/A',
        status: user.accountEnabled ? 'active' : 'inactive',
      }));

      logger.info(`Fetched ${normalizedUsers.length} users from Microsoft Graph`);
      return normalizedUsers;
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { status?: number } };
      if (err.response?.status === 401 || err.response?.status === 403) {
        logger.error('Microsoft Graph authentication/permission error', {
          status: err.response.status,
        });
        throw new Error('Admin consent required: Please grant application permissions in Azure AD');
      }

      logger.error('Failed to fetch users from Microsoft Graph', {
        error: err.message,
        status: err.response?.status,
      });
      throw new Error('Unable to fetch Office365 users');
    }
  }

  /**
   * Clear token cache (useful for testing or forced refresh)
   */
  clearTokenCache(): void {
    this.tokenCache = null;
  }
}

// Export singleton instance
export const microsoftGraphService = new MicrosoftGraphService();
export default microsoftGraphService;

