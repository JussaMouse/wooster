import { AppConfig } from '../configLoader'; 
import { log, LogLevel } from '../logger';
import fetch from 'node-fetch'; 

let weatherApiKey: string | undefined | null;
let weatherCity: string | undefined | null;

export function initializeWeatherTool(config: AppConfig) {
    weatherApiKey = config.tools.weather.openWeatherMapApiKey; 
    weatherCity = config.tools.weather.city;         
    log(LogLevel.INFO, 'Weather tool initialized', { city: weatherCity, apiKeySet: !!weatherApiKey });
}

interface WeatherData {
    main?: {
        temp?: number;
    };
    weather?: Array<{
        main?: string;
        description?: string;
    }>;
    name?: string;
    cod?: number | string; // For error codes like 401, 404 as number or string
    message?: string; // For error messages from API
}

export async function getWeatherForecastFunc(): Promise<string> {
    log(LogLevel.INFO, 'Tool: getWeatherForecastFunc called');

    if (!weatherCity) {
        log(LogLevel.WARN, 'getWeatherForecastFunc: WEATHER_CITY is not configured.');
        return "Weather forecast cannot be provided: City is not configured.";
    }
    if (!weatherApiKey) {
        log(LogLevel.WARN, 'getWeatherForecastFunc: OPENWEATHERMAP_API_KEY is not configured.');
        return "Weather forecast cannot be provided: API key is not configured.";
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(weatherCity)}&appid=${weatherApiKey}&units=metric`;

    try {
        log(LogLevel.DEBUG, `Fetching weather from: ${url}`);
        const response = await fetch(url);
        const data = await response.json() as WeatherData; // Parse JSON regardless of response.ok to get error messages

        if (!response.ok) {
            log(LogLevel.ERROR, `Error fetching weather: ${response.status} ${response.statusText}`, { data });
            if (response.status === 401 || data.cod === 401 || (typeof data.cod === 'string' && data.cod === "401")) {
                return "Could not fetch weather: Invalid API key. Please check your OPENWEATHERMAP_API_KEY.";
            }
            if (response.status === 404 || data.cod === 404 || (typeof data.cod === 'string' && data.cod === "404")) {
                return `Could not fetch weather: City "${weatherCity}" not found. Please check your WEATHER_CITY configuration.`;
            }
            return `Could not fetch weather: Server returned status ${response.status}. ${data.message || ''}`.trim();
        }

        log(LogLevel.DEBUG, 'Weather data received:', { data });

        const temp = data.main?.temp;
        const description = data.weather?.[0]?.description;
        const cityName = data.name; 

        if (temp === undefined || !description || !cityName) {
            log(LogLevel.ERROR, 'Error parsing weather data: temp, description, or city name missing.', { data });
            return "Could not parse weather data from the API.";
        }

        const tempFahrenheit = (temp * 9/5) + 32;

        const forecast = `Weather for ${cityName}: ${temp.toFixed(1)}°C (${tempFahrenheit.toFixed(1)}°F), ${description}.`;
        log(LogLevel.INFO, `Weather forecast generated: ${forecast}`);
        return forecast;

    } catch (error: any) {
        log(LogLevel.ERROR, 'Exception fetching or processing weather data:', { error: error.message, stack: error.stack });
        return "An unexpected error occurred while fetching the weather forecast.";
    }
} 