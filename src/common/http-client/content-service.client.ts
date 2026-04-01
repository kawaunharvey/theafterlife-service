import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosError, AxiosResponse } from "axios";

export interface CreateSessionRequest {
  policyId: string;
  originalFilename: string;
  expectedMimeType: string;
  assetType: "MEDIA" | "DOCUMENT";
  expectedSizeBytes?: number;
  requestedByUserId?: string;
  orgId?: string;
  shouldFlip?: boolean;
}

// Raw response from content service API
interface RawCreateSessionResponse {
  id: string;
  signedPutUrl?: string;
  storagePath: string;
  expiresAt: string;
  signedHeaders?: Record<string, string>;
  [key: string]: unknown; // Allow other fields
}

export interface CreateSessionResponse {
  id: string;
  uploadUrl: string; // Maps to signedPutUrl from content service
  objectName: string; // Maps to storagePath from content service
  expiresAt: string;
  signedHeaders?: Record<string, string>;
}

export interface CompleteSessionRequest {
  assetMeta?: Record<string, unknown>;
}

// Raw response from content service API
interface RawCompleteSessionResponse {
  id: string;
  assetType: string;
  status: string;
  bucketVisibility: string;
  storagePath: string;
  sizeBytes: string; // BigInt as string
  mimeType: string;
  extension?: string;
  contentLanguage?: string;
  publicUrl?: string;
  readUrl: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown; // Allow other fields
}

export interface CompleteSessionResponse {
  assetId: string;
  objectName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  readUrl: string; // Add the final URL
  storagePath?: string;
  id?: string;
}

export interface GetAssetResponse {
  id: string;
  objectName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  variants?: Array<{
    id: string;
    kind: string;
    url: string;
  }>;
  ocrText?: string;
}

export interface AssetVariantResponse {
  id: string;
  variantType: "THUMBNAIL" | "TRANSCODE" | "PREVIEW" | "OPTIMIZED" | "COVER";
  mimeType: string;
  extension?: string;
  storagePath: string;
  sizeBytes: string;
  width?: number;
  height?: number;
  durationMs?: number;
  format?: string;
  qualityHint?: number;
  publicUrl?: string;
  createdAt: string;
  readUrl: string;
}

type RequestFn<T> = () => Promise<AxiosResponse<T> | undefined>;

// Policy IDs from content service database
export const CONTENT_POLICIES = {
  GENERAL_MEDIA: "69140e37c89c6ad9b5a10c4a", // General media uploads (photos/videos)
  VIDEO_WITH_COVER: "69140e37c89c6ad9b5a10c4e", // Video uploads with cover generation
  PRIVATE_MEDIA: "69140e37c89c6ad9b5a10c4d", // Private media with signed URLs
  PROFILE_PICTURE: "69140e37c89c6ad9b5a10c4c", // Profile pictures and avatars
  DOCUMENT: "69140e37c89c6ad9b5a10c4b", // Documents (PDFs, Word docs)
} as const;

@Injectable()
export class ContentServiceClient {
  private readonly logger = new Logger("ContentServiceClient");
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  // Token management
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      "CONTENT_SERVICE_API_URL",
      "http://localhost:8080",
    );
    this.apiKey = this.configService.get<string>("CONTENT_SERVICE_API_KEY", "");
    this.secretKey = this.configService.get<string>(
      "CONTENT_SERVICE_SECRET_KEY",
      "",
    );
  }

  /**
   * Create an upload session via Content Service.
   */
  async createSession(
    req: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const headers = await this.getHeaders();
    const rawResponse = await this.retryableRequest<RawCreateSessionResponse>(
      () =>
        this.httpService
          .post<RawCreateSessionResponse>(
            `${this.baseUrl}/v1/sessions`,
            req,
            headers,
          )
          .toPromise(),
      "createSession",
    );

    // Transform the response to match our interface
    return {
      id: rawResponse.id,
      uploadUrl: rawResponse.signedPutUrl || "",
      objectName: rawResponse.storagePath || "",
      expiresAt: rawResponse.expiresAt,
      signedHeaders: rawResponse.signedHeaders,
    };
  }

  /**
   * Complete an upload session via Content Service.
   */
  async completeSession(
    sessionId: string,
    req?: CompleteSessionRequest,
  ): Promise<CompleteSessionResponse> {
    const headers = await this.getHeaders();
    const rawResponse = await this.retryableRequest<RawCompleteSessionResponse>(
      () =>
        this.httpService
          .post<RawCompleteSessionResponse>(
            `${this.baseUrl}/v1/sessions/${sessionId}/complete`,
            req || {},
            headers,
          )
          .toPromise(),
      `completeSession(${sessionId})`,
    );

    // Transform the response to match our interface
    return {
      assetId: rawResponse.id,
      objectName: rawResponse.storagePath,
      mimeType: rawResponse.mimeType,
      sizeBytes: Number.parseInt(rawResponse.sizeBytes, 10),
      uploadedAt: rawResponse.createdAt,
      readUrl: rawResponse.readUrl,
    };
  }

  /**
   * Get asset details from Content Service.
   */
  async getAsset(assetId: string): Promise<GetAssetResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GetAssetResponse>(
      () =>
        this.httpService
          .get<GetAssetResponse>(
            `${this.baseUrl}/v1/assets/${assetId}`,
            headers,
          )
          .toPromise(),
      `getAsset(${assetId})`,
    );
  }

  /**
   * Get asset variants (thumbnails, encoded versions, etc).
   */
  async getAssetVariants(assetId: string): Promise<AssetVariantResponse[]> {
    const headers = await this.getHeaders();
    const response = await this.retryableRequest<AssetVariantResponse[]>(
      () =>
        this.httpService
          .get<AssetVariantResponse[]>(
            `${this.baseUrl}/v1/assets/${assetId}/variants`,
            headers,
          )
          .toPromise(),
      `getAssetVariants(${assetId})`,
    );
    return response;
  }

  /**
   * Helper method to create a session for general media uploads (photos/videos).
   */
  async createMediaSession(
    filename: string,
    mimeType: string,
    sizeBytes?: number,
    userId?: string,
    orgId?: string,
  ): Promise<CreateSessionResponse> {
    return this.createSession({
      policyId: CONTENT_POLICIES.GENERAL_MEDIA,
      originalFilename: filename,
      expectedMimeType: mimeType,
      assetType: "MEDIA",
      expectedSizeBytes: sizeBytes,
      requestedByUserId: userId,
      orgId: orgId,
    });
  }

  /**
   * Helper method to create a session for document uploads.
   */
  async createDocumentSession(
    filename: string,
    mimeType: string,
    sizeBytes?: number,
    userId?: string,
    orgId?: string,
  ): Promise<CreateSessionResponse> {
    return this.createSession({
      policyId: CONTENT_POLICIES.DOCUMENT,
      originalFilename: filename,
      expectedMimeType: mimeType,
      assetType: "DOCUMENT",
      expectedSizeBytes: sizeBytes,
      requestedByUserId: userId,
      orgId: orgId,
    });
  }

  /**
   * Helper method to create a session for private media uploads.
   */
  async createPrivateMediaSession(
    filename: string,
    mimeType: string,
    sizeBytes?: number,
    userId?: string,
    orgId?: string,
  ): Promise<CreateSessionResponse> {
    return this.createSession({
      policyId: CONTENT_POLICIES.PRIVATE_MEDIA,
      originalFilename: filename,
      expectedMimeType: mimeType,
      assetType: "MEDIA",
      expectedSizeBytes: sizeBytes,
      requestedByUserId: userId,
      orgId: orgId,
    });
  }

  /**
   * Helper method to create a session for profile picture uploads.
   */
  async createProfilePictureSession(
    filename: string,
    mimeType: string,
    sizeBytes?: number,
    userId?: string,
    orgId?: string,
  ): Promise<CreateSessionResponse> {
    return this.createSession({
      policyId: CONTENT_POLICIES.PROFILE_PICTURE,
      originalFilename: filename,
      expectedMimeType: mimeType,
      assetType: "MEDIA",
      expectedSizeBytes: sizeBytes,
      requestedByUserId: userId,
      orgId: orgId,
    });
  }

  /**
   * Generic retryable HTTP request with exponential backoff.
   */
  private async retryableRequest<T>(
    fn: RequestFn<T>,
    label: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fn();
        if (!response) {
          throw new Error("No response from request");
        }
        return response.data;
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on 4xx errors (client errors)
        if (axiosError.response && axiosError.response.status < 500) {
          this.logger.error(
            `[${label}] Client error: ${axiosError.response.status}`,
            axiosError.response.data,
          );
          throw error;
        }

        // For 5xx or network errors, retry with backoff
        if (attempt < this.maxRetries - 1) {
          const delayMs = this.retryDelayMs * 2 ** attempt;
          this.logger.warn(
            `[${label}] Attempt ${attempt + 1} failed; retrying in ${delayMs}ms`,
            lastError.message,
          );
          await this.delay(delayMs);
        }
      }
    }

    this.logger.error(
      `[${label}] Failed after ${this.maxRetries} attempts`,
      lastError,
    );
    throw lastError || new Error(`Request failed: ${label}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get access token using service key authentication
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt
    ) {
      return this.accessToken;
    }

    try {
      const response = await this.httpService
        .post(
          `${this.baseUrl}/v1/auth/service-login`,
          {
            apiKey: this.apiKey,
            secretKey: this.secretKey,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        )
        .toPromise();

      if (!response?.data) {
        throw new Error("No response data from service token endpoint");
      }

      this.accessToken = response.data.access_token;
      // Calculate expiration time (expires_in is in seconds)
      this.tokenExpiresAt =
        Date.now() + (response.data.expires_in || 86400) * 1000;

      this.logger.debug("Content service access token obtained successfully");
      return this.accessToken!;
    } catch (error) {
      this.logger.error(
        "Failed to obtain access token from content service",
        error,
      );
      throw error;
    }
  }

  private async getHeaders() {
    const token = await this.getAccessToken();
    return {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
  }
}
