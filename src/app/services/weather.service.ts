import { Injectable } from '@angular/core';
import { Geolocation, PermissionStatus } from '@capacitor/geolocation';

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: 'céu limpo',
  1: 'poucas nuvens',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'neblina',
  48: 'neblina com geada',
  51: 'garoa fraca',
  53: 'garoa moderada',
  55: 'garoa forte',
  56: 'garoa congelante fraca',
  57: 'garoa congelante forte',
  61: 'chuva fraca',
  63: 'chuva moderada',
  65: 'chuva forte',
  66: 'chuva congelante fraca',
  67: 'chuva congelante forte',
  71: 'neve fraca',
  73: 'neve moderada',
  75: 'neve forte',
  77: 'granizo fino',
  80: 'pancadas de chuva fracas',
  81: 'pancadas de chuva moderadas',
  82: 'pancadas de chuva fortes',
  85: 'pancadas de neve fracas',
  86: 'pancadas de neve fortes',
  95: 'tempestade',
  96: 'tempestade com granizo fraco',
  99: 'tempestade com granizo forte',
};

const DAY_LABELS = ['hoje', 'amanhã', 'depois de amanhã'];

interface OpenMeteoResponse {
  current_weather: { temperature: number; weathercode: number };
  daily: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  async getForecastSummary(): Promise<string> {
    const { latitude, longitude } = await this.getCurrentCoordinates();
    const data = await this.fetchForecast(latitude, longitude);
    return this.formatSummary(data);
  }

  private async getCurrentCoordinates(): Promise<{ latitude: number; longitude: number }> {
    await this.ensureLocationPermission();

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000,
      });
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch (err) {
      console.error('diagnostic: getCurrentPosition failed ->', err);
      throw new Error(
        'Não consegui obter sua localização. Verifique se o GPS/localização está ativado no aparelho e se há sinal, e tente novamente.'
      );
    }
  }

  private async ensureLocationPermission(): Promise<void> {
    let status: PermissionStatus;

    try {
      status = await Geolocation.checkPermissions();
      console.log('diagnostic: geolocation permission status ->', JSON.stringify(status));
    } catch (err) {
      console.error('diagnostic: checkPermissions failed ->', err);
      throw new Error('Não foi possível verificar a permissão de localização neste aparelho.');
    }

    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return;
    }

    try {
      status = await Geolocation.requestPermissions();
      console.log('diagnostic: geolocation permission after request ->', JSON.stringify(status));
    } catch (err) {
      console.error('diagnostic: requestPermissions failed ->', err);
      throw new Error('Não foi possível solicitar a permissão de localização.');
    }

    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new Error(
        'Permissão de localização negada. Ative em Ajustes do aparelho > Apps > K.I.R.A. > Permissões > Localização.'
      );
    }
  }

  private async fetchForecast(latitude: number, longitude: number): Promise<OpenMeteoResponse> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      '&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3';

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Não foi possível consultar o serviço de previsão do tempo agora.');
    }

    return response.json();
  }

  private formatSummary(data: OpenMeteoResponse): string {
    const current = data.current_weather;
    const daily = data.daily;

    const parts = [
      `Agora está ${this.describeWeatherCode(current.weathercode)}, com ${Math.round(current.temperature)} graus.`,
    ];

    const forecastDays = Math.min(3, daily.time.length);
    for (let i = 1; i < forecastDays; i++) {
      const label = DAY_LABELS[i] ?? `em ${i} dias`;
      const description = this.describeWeatherCode(daily.weathercode[i]);
      const max = Math.round(daily.temperature_2m_max[i]);
      const min = Math.round(daily.temperature_2m_min[i]);
      parts.push(`Para ${label}, previsão de ${description}, com mínima de ${min} e máxima de ${max} graus.`);
    }

    return parts.join(' ');
  }

  private describeWeatherCode(code: number): string {
    return WEATHER_DESCRIPTIONS[code] ?? 'tempo estável';
  }
}
