import { DynamicTool } from 'langchain/tools';
import { z } from 'zod';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

// Type for the forecast function, matching what DailyReview expects.
// Ideally, this would be a shared type in a more central location if many plugins use this exact signature.
export type GetWeatherForecastType = () => Promise<string>;

interface WeatherResponse {
  cod: string;
  message: number | string;
  cnt: number;
  list: ForecastSlot[];
  city: {
    id: number;
    name: string;
    coord: { lat: number; lon: number };
    country: string;
    population: number;
    timezone: number;
    sunrise: number;
    sunset: number;
  };
}

interface ForecastSlot {
  dt: number;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    sea_level: number;
    grnd_level: number;
    humidity: number;
    temp_kf: number;
  };
  weather: {
    id: number;
    main: string;
    description: string;
    icon: string;
  }[];
  clouds: {
    all: number;
  };
  wind: {
    speed: number;
    deg: number;
    gust: number;
  };
  visibility: number;
  pop: number; // Probability of precipitation
  sys: {
    pod: string; // Part of day (d or n)
  };
  dt_txt: string; // Data/time of calculation, UTC
}

// Helper function to format a Date object to a local time string like "3 PM"
function formatToLocalHour(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', hour12: true }).toLowerCase();
}

const getWeatherInputSchema = z.object({});

class WeatherPluginDefinition implements WoosterPlugin {
  static readonly pluginName = "weather";
  static readonly version = "1.0.1"; // Incremented version due to refactor
  static readonly description = "Provides weather forecast information using OpenWeatherMap.";

  readonly name = WeatherPluginDefinition.pluginName;
  readonly version = WeatherPluginDefinition.version;
  readonly description = WeatherPluginDefinition.description;

  private core: CoreServices | null = null;
  private weatherApiKey: string | null = null;
  private weatherCity: string | null = null;
  private apiUnits: "metric" | "imperial" = "imperial";
  private displayUnits: "C" | "F" = "F";
  
  private getWeatherToolInstance!: DynamicTool;

  private logMsg(level: LogLevel, message: string, details?: object) {
    this.core?.log(level, `[${this.name} Plugin v${this.version}] ${message}`, details);
  }

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.core = services;
    this.logMsg(LogLevel.INFO, 'Initializing...');

    if (config.weather) {
      this.weatherApiKey = config.weather.openWeatherMapApiKey;
      this.weatherCity = config.weather.city;
      const configuredDisplayUnits = config.weather.units;

      if (configuredDisplayUnits === "C") {
        this.displayUnits = "C";
        this.apiUnits = "metric";
      } else if (configuredDisplayUnits === "F") {
        this.displayUnits = "F";
        this.apiUnits = "imperial";
      } else {
        this.displayUnits = "F"; 
        this.apiUnits = "imperial";
        if (configuredDisplayUnits) {
          this.logMsg(LogLevel.WARN, `Invalid display units "${configuredDisplayUnits}" from config. Defaulting to ${this.displayUnits} (API: ${this.apiUnits}).`);
        }
      }
      this.logMsg(LogLevel.INFO, `Configured with city "${this.weatherCity}", API key present. Display units: "${this.displayUnits}" (API units: "${this.apiUnits}").`);
    } else {
      this.logMsg(LogLevel.WARN, "Main 'weather' config section not found. API key, city, or units might be missing.");
    }

    services.registerService("getWeatherForecastFunction", this.getWeatherForecastServiceMethod.bind(this));
    this.logMsg(LogLevel.INFO, 'getWeatherForecastFunction registered as a service.');

    this.getWeatherToolInstance = new DynamicTool({
      name: "get_weather_forecast",
      description: `Provides the current weather forecast for the pre-configured city (${this.weatherCity || 'unknown'}). Expects an empty object as input.`,
      func: async (_input: z.infer<typeof getWeatherInputSchema>) => {
        this.logMsg(LogLevel.DEBUG, "get_weather_forecast tool called.", { input: _input });
        return this._fetchWeatherFromApi();
      },
    });
  }

  public async getWeatherForecastServiceMethod(): Promise<string> {
    return this._fetchWeatherFromApi();
  }
  
  private async _fetchWeatherFromApi(): Promise<string> {
    if (!this.core) {
      // Should not happen if initialize was called
      console.error("WeatherPlugin Error: Core services not available post-initialization.");
      return "WeatherPlugin Internal Error: Core services not available.";
    }
    if (!this.weatherApiKey || !this.weatherCity) {
      this.logMsg(LogLevel.WARN, 'API key or city not configured. Cannot fetch weather.');
      return "Weather information is unavailable because the API key or city is not configured.";
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(this.weatherCity)}&appid=${this.weatherApiKey}&units=${this.apiUnits}`;

    try {
      this.logMsg(LogLevel.INFO, `Fetching weather for ${this.weatherCity} from OpenWeatherMap using ${this.apiUnits} for API.`);
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorBody = await response.text();
        this.logMsg(LogLevel.ERROR, `API request failed with status ${response.status}. Response: ${errorBody}`, { city: this.weatherCity, status: response.status });
        return `Weather information for ${this.weatherCity} is currently unavailable (API error: ${response.status}).`;
      }

      const data = await response.json() as WeatherResponse;

      if (data.cod !== "200") {
        this.logMsg(LogLevel.ERROR, `API returned error code ${data.cod}. Message: ${data.message}`, { city: this.weatherCity, responseData: data });
        return `Weather information for ${this.weatherCity} is currently unavailable (API response error: ${data.cod}).`;
      }
      
      if (!data.list || data.list.length === 0) {
        this.logMsg(LogLevel.WARN, 'No forecast data received from API.', { city: this.weatherCity, responseData: data });
        return `No forecast data available for ${this.weatherCity}.`;
      }

      const currentForecast = data.list[0];
      const currentTemp = Math.round(currentForecast.main.temp);
      const currentWeatherDescription = currentForecast.weather[0]?.description || 'N/A';
      const currentWeatherMain = currentForecast.weather[0]?.main.toLowerCase() || '';
      const currentPop = Math.round((currentForecast.pop || 0) * 100);

      const isCurrentlyRaining = ["rain", "drizzle", "thunderstorm", "shower"].some(term => currentWeatherMain.includes(term) || currentWeatherDescription.toLowerCase().includes(term));

      const now = new Date();
      const localTenPM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0);
      
      let maxPopToday = 0;
      let maxPopSlot: ForecastSlot | null = null;
      let relevantSlotsFound = false;

      for (const slot of data.list) {
        const slotDate = new Date(slot.dt * 1000);
        if (slotDate >= now && slotDate <= localTenPM) {
          if (slot.pop > maxPopToday) {
            maxPopToday = slot.pop;
            maxPopSlot = slot;
          }
          relevantSlotsFound = true;
        }
        if (slotDate > localTenPM && slotDate.getDate() === now.getDate()) { 
          break;
        }
      }
      
      const maxPopPercentageToday = Math.round(maxPopToday * 100);

      let forecastString = `Currently in ${this.weatherCity}: `;
      if (isCurrentlyRaining) {
        forecastString += `Raining, ${currentTemp}°${this.displayUnits}.`;
      } else {
        forecastString += `${currentTemp}°${this.displayUnits}, ${currentWeatherDescription}.`;
      }

      if (relevantSlotsFound && maxPopSlot && maxPopPercentageToday > 0) {
        const slotTime = new Date(maxPopSlot.dt * 1000);
        const slotStartHour = formatToLocalHour(slotTime);
        const slotEndHour = formatToLocalHour(new Date(slotTime.getTime() + 3 * 60 * 60 * 1000)); // Assuming 3-hour slots
        
        if (isCurrentlyRaining) {
          if (maxPopSlot.dt > currentForecast.dt && maxPopPercentageToday > currentPop) {
              forecastString += ` The highest chance of continued rain (${maxPopPercentageToday}%) is between ${slotStartHour} - ${slotEndHour} today.`;
          } else if (maxPopSlot.dt === currentForecast.dt && maxPopPercentageToday >= currentPop) {
               forecastString += ` This period has a ${maxPopPercentageToday}% chance of rain.`;
          }
        } else {
          forecastString += ` Highest chance of rain (${maxPopPercentageToday}%) today is between ${slotStartHour} - ${slotEndHour}.`;
        }
      } else if (isCurrentlyRaining) {
        // No action needed, initial string is sufficient if it's already raining and no higher chance later
      } else {
        forecastString += ` Little to no rain expected until 10 PM. Current chance of rain: ${currentPop}%.`;
      }
      
      this.logMsg(LogLevel.INFO, `Successfully fetched and processed weather for ${this.weatherCity}.`);
      return forecastString;

    } catch (error: any) {
      this.logMsg(LogLevel.ERROR, 'Error fetching or processing weather data.', { error: error.message, stack: error.stack, city: this.weatherCity });
      return `An error occurred while fetching weather information for ${this.weatherCity}.`;
    }
  }

  getAgentTools?() {
    const appConfig = this.core?.getConfig();
    // Check if plugin specifically enabled and if essential config (API key and city) is present
    if (appConfig && appConfig.plugins[this.name] === true && this.weatherApiKey && this.weatherCity) {
        this.logMsg(LogLevel.DEBUG, 'Providing get_weather_forecast tool.');
        return [this.getWeatherToolInstance];
    }
    this.logMsg(LogLevel.DEBUG, 'Not providing get_weather_forecast tool (plugin disabled, or API key/city missing).');
    return [];
  }
}

export default WeatherPluginDefinition; 