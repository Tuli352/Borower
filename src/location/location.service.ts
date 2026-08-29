import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

  async autocomplete(query: string) {
    if (!this.googleApiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY is not set. Returning empty autocomplete results.');
      return [];
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params: {
          input: query,
          key: this.googleApiKey,
        },
      });

      if (response.data.status === 'OK') {
        return response.data.predictions;
      }

      this.logger.warn(`Google Autocomplete status: ${response.data.status}. Using mock fallback.`);
      return this.getMockPredictions(query).predictions;
    } catch (error) {
      this.logger.error(`Autocomplete failed: ${error.message}. Using mock fallback.`);
      return this.getMockPredictions(query).predictions;
    }
  }

  private getMockPredictions(query: string) {
    const mocks = [
      { description: 'Grand Square, Lokoja, Kogi State', place_id: 'mock_1' },
      { description: 'Kogi State University, Anyigba', place_id: 'mock_2' },
      { description: 'Federal University Lokoja', place_id: 'mock_3' },
      { description: 'Ganaja Junction, Lokoja', place_id: 'mock_4' },
      { description: 'Post Office, Lokoja', place_id: 'mock_5' },
    ];
    
    const filtered = mocks.filter(m => m.description.toLowerCase().includes(query.toLowerCase()));
    return { predictions: filtered.length > 0 ? filtered : mocks, status: 'OK' };
  }

  async geocode(address: string) {
    if (!this.googleApiKey) {
      throw new BadRequestException('Location services are not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: this.googleApiKey,
        },
      });

      if (response.data.status === 'OK') {
        const result = response.data.results[0];
        return {
          address: result.formatted_address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          placeId: result.place_id,
        };
      }

      this.logger.warn(`Google Geocode status: ${response.data.status}. Using mock fallback.`);
      return this.getMockGeocode(address);
    } catch (error) {
      this.logger.error(`Geocoding failed: ${error.message}. Using mock fallback.`);
      return this.getMockGeocode(address);
    }
  }

  private getMockGeocode(address: string) {
    // Return coordinates for Lokoja center if unknown
    const mocks: Record<string, any> = {
      'mock_1': { lat: 7.8023, lng: 6.7333 },
      'mock_2': { lat: 7.4833, lng: 7.1833 },
      'mock_3': { lat: 7.7923, lng: 6.7433 },
    };

    // If it's a mock ID from our autocomplete
    if (address.startsWith('mock_')) return { address: 'Lokoja, Kogi State', ...mocks[address] || mocks['mock_1'] };

    return {
      address: address || 'Lokoja, Kogi State',
      lat: 7.8023,
      lng: 6.7333,
      placeId: 'mock_fallback',
    };
  }

  async reverseGeocode(lat: number, lng: number) {
    if (!this.googleApiKey) {
      this.logger.warn('Google Maps API Key not set. Falling back to Nominatim.');
      return this.getNominatimReverseGeocode(lat, lng);
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${lat},${lng}`,
          key: this.googleApiKey,
        },
      });

      if (response.data.status === 'OK') {
        const result = response.data.results[0];
        return {
          address: result.formatted_address,
          placeId: result.place_id,
          addressComponents: result.address_components,
        };
      }

      this.logger.warn(`Google Reverse Geocode status: ${response.data.status}. Using Nominatim fallback.`);
      return this.getNominatimReverseGeocode(lat, lng);
    } catch (error) {
      this.logger.error(`Reverse geocoding failed: ${error.message}. Using Nominatim fallback.`);
      return this.getNominatimReverseGeocode(lat, lng);
    }
  }

  private async getNominatimReverseGeocode(lat: number, lng: number) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          format: 'json',
          lat: lat,
          lon: lng,
        },
        headers: {
          'User-Agent': 'KogiRiderApp/1.0',
        },
      });
      
      if (response.data && response.data.display_name) {
        // Limit the address length to look cleaner
        const addressParts = response.data.display_name.split(', ');
        const cleanAddress = addressParts.slice(0, 3).join(', ');
        return { address: cleanAddress, placeId: 'nom_' + response.data.osm_id };
      }
      return { address: 'Unknown Location', placeId: 'mock_rev_1' };
    } catch (error) {
      this.logger.error(`Nominatim fallback failed: ${error.message}`);
      return { address: 'Unknown Location', placeId: 'mock_rev_1' };
    }
  }
}
