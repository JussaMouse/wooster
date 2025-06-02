import { DynamicTool } from '@langchain/core/tools';
import { AppConfig } from '../../configLoader';
import { WoosterPlugin, CoreServices } from '../../types/plugin';
import { LogLevel } from '../../logger';

// Type for the forecast function, matching what DailyReview expects.
// Ideally, this would be a shared type in a more central location if many plugins use this exact signature.
export type GetWeatherForecastType = () => Promise<string>;

let core: CoreServices | null = null;
let weatherApiKey: string | null = null;
let weatherCity: string | null = null;

// Placeholder for actual weather fetching logic
async function fetchWeatherFromApi(): Promise<string> {
  if (!core) {
    return "WeatherPlugin Error: Core services not available.";
  }
  if (!weatherApiKey || !weatherCity) {
    core.log(LogLevel.WARN, 'WeatherPlugin: API key or city not configured. Cannot fetch weather.');
    return "Weather information is unavailable because the API key or city is not configured.";
  }

  core.log(LogLevel.INFO, `WeatherPlugin: Fetching weather for ${weatherCity} (using OpenWeatherMap).`);
  // In a real plugin, this would call OpenWeatherMap API with weatherApiKey and weatherCity
  // For now, simulate a successful call if params are present.
  return `Today's forecast for ${weatherCity}: Sunny with a chance of high productivity! (from WeatherPlugin using key: ${weatherApiKey.substring(0, 4)}...)`;
}

// This function will be registered as a service
const getWeatherForecastFunction: GetWeatherForecastType = async () => {
  return fetchWeatherFromApi();
};

// Agent Tool Definition
const getWeatherTool = new DynamicTool({
  name: "get_weather_forecast",
  description: "Provides the current weather forecast for the pre-configured city. Takes no input.",
  func: async () => {
    if (core) {
      core.log(LogLevel.DEBUG, "WeatherPlugin: get_weather_forecast tool called.");
    }
    return fetchWeatherFromApi(); 
  },
});

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
      if (weatherApiKey && weatherCity) {
        core.log(LogLevel.INFO, `WeatherPlugin: Configured with city "${weatherCity}" and API key.`);
      } else {
        core.log(LogLevel.WARN, "WeatherPlugin: API key or city missing in config.weather. Weather functionality will be limited.");
      }
    } else {
      core.log(LogLevel.WARN, "WeatherPlugin: Main 'weather' config section not found.");
    }

    // Register the forecast function as a service
    services.registerService("getWeatherForecastFunction", getWeatherForecastFunction);
    core.log(LogLevel.INFO, 'WeatherPlugin: getWeatherForecastFunction registered as a service.');
  }

  getAgentTools?(): DynamicTool[] {
    const appConfig = core?.getConfig();
    // Plugin itself enabled by pluginManager via config.plugins.weather
    // Tool should only be active if API key and city are also configured
    if (appConfig && appConfig.plugins[this.name] === true && weatherApiKey && weatherCity) {
        core?.log(LogLevel.DEBUG, 'WeatherPlugin: Providing get_weather_forecast tool (plugin enabled, API key and city present).');
        return [getWeatherTool];
    }
    core?.log(LogLevel.DEBUG, 'WeatherPlugin: Not providing get_weather_forecast tool (plugin disabled, or API key/city missing).');
    return [];
  }
}

export default new WeatherPluginDefinition(); 