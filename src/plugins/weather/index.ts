import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

// Type for the forecast function, matching what DailyReview expects.
// Ideally, this would be a shared type in a more central location if many plugins use this exact signature.
export type GetWeatherForecastType = () => Promise<string>;

let core: CoreServices | null = null;
let weatherApiKey: string | null = null;
let weatherCity: string | null = null;
let apiUnits: "metric" | "imperial" = "imperial"; // For OpenWeatherMap API call, default to imperial if not specified
let displayUnits: "C" | "F" = "F"; // For display, default to F

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

async function fetchWeatherFromApi(): Promise<string> {
  if (!core) {
    return "WeatherPlugin Error: Core services not available.";
  }
  if (!weatherApiKey || !weatherCity) {
    core.log(LogLevel.WARN, 'WeatherPlugin: API key or city not configured. Cannot fetch weather.');
    return "Weather information is unavailable because the API key or city is not configured.";
  }

  const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(weatherCity)}&appid=${weatherApiKey}&units=${apiUnits}`;

  try {
    core.log(LogLevel.INFO, `WeatherPlugin: Fetching weather for ${weatherCity} from OpenWeatherMap using ${apiUnits} for API.`);
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorBody = await response.text();
      core.log(LogLevel.ERROR, `WeatherPlugin: API request failed with status ${response.status}. Response: ${errorBody}`, { city: weatherCity, status: response.status });
      return `Weather information for ${weatherCity} is currently unavailable (API error: ${response.status}).`;
    }

    const data = await response.json() as WeatherResponse;

    if (data.cod !== "200") {
      core.log(LogLevel.ERROR, `WeatherPlugin: API returned error code ${data.cod}. Message: ${data.message}`, { city: weatherCity, responseData: data });
      return `Weather information for ${weatherCity} is currently unavailable (API response error: ${data.cod}).`;
    }
    
    if (!data.list || data.list.length === 0) {
      core.log(LogLevel.WARN, 'WeatherPlugin: No forecast data received from API.', { city: weatherCity, responseData: data });
      return `No forecast data available for ${weatherCity}.`;
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

    let forecastString = `Currently in ${weatherCity}: `;
    if (isCurrentlyRaining) {
      forecastString += `Raining, ${currentTemp}°${displayUnits}.`;
    } else {
      forecastString += `${currentTemp}°${displayUnits}, ${currentWeatherDescription}.`;
    }

    if (relevantSlotsFound && maxPopSlot && maxPopPercentageToday > 0) {
      const slotTime = new Date(maxPopSlot.dt * 1000);
      const slotStartHour = formatToLocalHour(slotTime);
      const slotEndHour = formatToLocalHour(new Date(slotTime.getTime() + 3 * 60 * 60 * 1000));
      
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
      // No action needed, initial string is sufficient
    } else {
      forecastString += ` Little to no rain expected until 10 PM. Current chance of rain: ${currentPop}%.`;
    }
    
    core.log(LogLevel.INFO, `WeatherPlugin: Successfully fetched and processed weather for ${weatherCity}.`);
    return forecastString;

  } catch (error: any) {
    core.log(LogLevel.ERROR, 'WeatherPlugin: Error fetching or processing weather data.', { error: error.message, stack: error.stack, city: weatherCity });
    return `An error occurred while fetching weather information for ${weatherCity}.`;
  }
}

// This function will be registered as a service
const getWeatherForecastFunction: GetWeatherForecastType = async () => {
  return fetchWeatherFromApi();
};

// Define the Zod schema for the input (an empty object)
const getWeatherInputSchema = z.object({});

// Agent Tool Definition using the `tool` utility function
const getWeatherTool = tool(
  async (_input: z.infer<typeof getWeatherInputSchema>) => {
    // _input will be an empty object here, not used by fetchWeatherFromApi
    if (core) {
      core.log(LogLevel.DEBUG, "WeatherPlugin: get_weather_forecast tool (created with 'tool' utility) called with input.", { input: _input });
    }
    return fetchWeatherFromApi();
  },
  {
    name: "get_weather_forecast",
    description: "Provides the current weather forecast for the pre-configured city. Expects an empty object as input.",
    schema: getWeatherInputSchema,
  }
);

class WeatherPluginDefinition implements WoosterPlugin {
  readonly name = "weather";
  readonly version = "1.0.0";
  readonly description = "Provides weather forecast information using OpenWeatherMap.";

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    core = services;
    core.log(LogLevel.INFO, `WeatherPlugin (v${this.version}): Initializing...`);

    if (config.weather) {
      weatherApiKey = config.weather.openWeatherMapApiKey;
      weatherCity = config.weather.city;
      const configuredDisplayUnits = config.weather.units; // This is "C" or "F", or undefined

      if (configuredDisplayUnits === "C") {
        displayUnits = "C";
        apiUnits = "metric";
      } else if (configuredDisplayUnits === "F") {
        displayUnits = "F";
        apiUnits = "imperial";
      } else {
        // Default if undefined or invalid - configLoader defaults to "F"
        // so we align plugin defaults here if somehow an invalid value bypasses configLoader
        displayUnits = "F"; 
        apiUnits = "imperial";
        if (configuredDisplayUnits) { // Log if it was defined but invalid
            core.log(LogLevel.WARN, `WeatherPlugin: Invalid display units "${configuredDisplayUnits}" from config. Defaulting to ${displayUnits} (API: ${apiUnits}).`);
        }
      }
      core.log(LogLevel.INFO, `WeatherPlugin: Configured with city "${weatherCity}", API key. Display units: "${displayUnits}" (API units: "${apiUnits}").`);
    } else {
      core.log(LogLevel.WARN, "WeatherPlugin: Main 'weather' config section not found. API key, city, or units might be missing.");
      // Keep default apiUnits = "imperial" and displayUnits = "F" if no config.weather
    }

    services.registerService("getWeatherForecastFunction", getWeatherForecastFunction);
    core.log(LogLevel.INFO, 'WeatherPlugin: getWeatherForecastFunction registered as a service.');
  }

  getAgentTools?() { // Let TypeScript infer the return type based on the tool function, or use : StructuredTool[] if confident
    const appConfig = core?.getConfig();
    if (appConfig && appConfig.plugins[this.name] === true && weatherApiKey && weatherCity) {
        core?.log(LogLevel.DEBUG, 'WeatherPlugin: Providing get_weather_forecast tool (created with tool utility).');
        return [getWeatherTool];
    }
    core?.log(LogLevel.DEBUG, 'WeatherPlugin: Not providing get_weather_forecast tool (plugin disabled, or API key/city missing).');
    return [];
  }
}

export default new WeatherPluginDefinition(); 