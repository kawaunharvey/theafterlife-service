import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { Env } from "@/config/env";

export type NearbyPlace = {
  placeId: string;
  name?: string;
};

export type PlaceDetails = {
  placeId: string;
  name?: string;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  website?: string;
  location?: { lat: number; lng: number };
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  types?: string[];
  rating?: number;
  userRatingsTotal?: number;
  openingHours?: string[];
  priceLevel?: number;
  utcOffsetMinutes?: number;
};

export type ReverseGeocodeResult = {
  placeId?: string;
  name?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
};

@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);
  private readonly apiKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.apiKey = this.config.get("GOOGLE_PLACES_API_KEY", { infer: true });
  }

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    if (!this.apiKey) {
      this.logger.warn(
        { lat, lng },
        "GOOGLE_PLACES_API_KEY is not set; reverse geocode skipped",
      );
      return {};
    }

    const placesUrl = "https://places.googleapis.com/v1/places:searchNearby";
    try {
      const placesResponse = await firstValueFrom(
        this.http.post(
          placesUrl,
          {
            locationRestriction: {
              circle: {
                center: {
                  latitude: lat,
                  longitude: lng,
                },
                radius: 50,
              },
            },
            maxResultCount: 1,
          },
          {
            headers: {
              "X-Goog-Api-Key": this.apiKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.addressComponents",
            },
          },
        ),
      );

      const place = placesResponse.data?.places?.[0];
      if (place) {
        const components = place.addressComponents || [];
        const lookup = (type: string): string | undefined =>
          components.find((component: { types?: string[] }) =>
            component.types?.includes(type),
          )?.longText;

        return {
          placeId: place.id,
          name: place.displayName?.text,
          formattedAddress: place.formattedAddress,
          city: lookup("locality") || lookup("postal_town"),
          state: lookup("administrative_area_level_1"),
          country: lookup("country"),
          postalCode: lookup("postal_code"),
        };
      }

      const geocodeUrl = "https://maps.googleapis.com/maps/api/geocode/json";
      const geocodeResponse = await firstValueFrom(
        this.http.get(geocodeUrl, {
          params: {
            latlng: `${lat},${lng}`,
            key: this.apiKey,
          },
        }),
      );

      const geocodeResult = geocodeResponse.data?.results?.[0];
      if (!geocodeResult) {
        this.logger.warn(
          { lat, lng, status: geocodeResponse.data?.status },
          "Reverse geocode returned no results",
        );
        return {};
      }

      const geocodeComponents = geocodeResult.address_components || [];
      const geocodeLookup = (type: string): string | undefined =>
        geocodeComponents.find((component: { types?: string[] }) =>
          component.types?.includes(type),
        )?.long_name;

      return {
        placeId: geocodeResult.place_id,
        formattedAddress: geocodeResult.formatted_address,
        city: geocodeLookup("locality") || geocodeLookup("postal_town"),
        state: geocodeLookup("administrative_area_level_1"),
        country: geocodeLookup("country"),
        postalCode: geocodeLookup("postal_code"),
      };
    } catch (error) {
      this.logger.warn(
        {
          lat,
          lng,
          status: (error as any).response?.status,
          errorMessage:
            (error as any).response?.data?.error?.message ||
            (error instanceof Error ? error.message : String(error)),
        },
        "Google reverse geocode returned error",
      );
      return {};
    }
  }

  async searchNearby(params: {
    lat: number;
    lng: number;
    radiusMeters: number;
    googleType?: string;
    pageToken?: string;
  }): Promise<{ results: NearbyPlace[]; nextPageToken?: string }> {
    const { lat, lng, radiusMeters, googleType, pageToken } = params;
    const url = "https://places.googleapis.com/v1/places:searchNearby";

    const requestBody: {
      locationRestriction: {
        circle: {
          center: { latitude: number; longitude: number };
          radius: number;
        };
      };
      maxResultCount: number;
      includedTypes?: string[];
      pageToken?: string;
    } = {
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
    };

    if (googleType) {
      requestBody.includedTypes = [googleType];
    }

    if (pageToken) {
      requestBody.pageToken = pageToken;
    }

    try {
      const response = await firstValueFrom(
        this.http.post(url, requestBody, {
          headers: {
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName",
          },
        }),
      );

      const results: NearbyPlace[] = (response.data.places || [])
        .map((item: { id?: string; displayName?: { text?: string } }) => ({
          placeId: item.id,
          name: item.displayName?.text,
        }))
        .filter((item: NearbyPlace) => Boolean(item.placeId));

      return {
        results,
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error) {
      this.logger.error(
        {
          status: (error as any).response?.status,
          errorMessage:
            (error as any).response?.data?.error?.message ||
            (error instanceof Error ? error.message : String(error)),
          errorDetails: (error as any).response?.data?.error,
        },
        "Google Places searchNearby returned error",
      );
      throw error;
    }
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const fieldMask = [
      "id",
      "displayName",
      "formattedAddress",
      "internationalPhoneNumber",
      "websiteUri",
      "location",
      "viewport",
      "types",
      "rating",
      "userRatingCount",
      "regularOpeningHours.weekdayDescriptions",
      "priceLevel",
      "utcOffsetMinutes",
    ].join(",");

    try {
      const response = await firstValueFrom(
        this.http.get(url, {
          headers: {
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
        }),
      );

      const result = response.data;
      if (!result) {
        return null;
      }

      return {
        placeId: result.id || placeId,
        name: result.displayName?.text,
        formattedAddress: result.formattedAddress,
        internationalPhoneNumber: result.internationalPhoneNumber,
        website: result.websiteUri,
        location: result.location
          ? {
              lat: result.location.latitude,
              lng: result.location.longitude,
            }
          : undefined,
        viewport: result.viewport
          ? {
              northeast: {
                lat: result.viewport.high?.latitude,
                lng: result.viewport.high?.longitude,
              },
              southwest: {
                lat: result.viewport.low?.latitude,
                lng: result.viewport.low?.longitude,
              },
            }
          : undefined,
        types: result.types,
        rating: result.rating,
        userRatingsTotal: result.userRatingCount,
        openingHours: result.regularOpeningHours?.weekdayDescriptions,
        priceLevel: result.priceLevel
          ? this.parsePriceLevel(result.priceLevel)
          : undefined,
        utcOffsetMinutes: result.utcOffsetMinutes,
      };
    } catch (error) {
      this.logger.warn(
        {
          placeId,
          status: (error as any).response?.status,
          errorMessage:
            (error as any).response?.data?.error?.message ||
            (error instanceof Error ? error.message : String(error)),
        },
        "Google Place Details returned error",
      );
      return null;
    }
  }

  private parsePriceLevel(priceLevel: string): number | undefined {
    const mapping: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    return mapping[priceLevel];
  }
}
