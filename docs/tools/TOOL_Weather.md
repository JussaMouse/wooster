# Tool: Get Weather Forecast (`get_weather_forecast`)

This document details the `get_weather_forecast` tool available to Wooster's agent.

## 1. Purpose

The `get_weather_forecast` tool enables the agent to fetch the current weather forecast for a predefined city. This is primarily used for the Daily Review feature but can also be invoked directly by the agent if needed.

## 2. Agent-Facing Description

When deciding to use this tool, the agent is provided with the following description:

```
Fetches the current weather forecast (temperature and conditions) for the user's pre-configured city. Input is not required as the city is set in the environment configuration.
```

## 3. Tool Name

`get_weather_forecast`

## 4. Input Schema

- **Type**: None.
- **Description**: This tool does not require any input from the agent. It uses the `WEATHER_CITY` environment variable to determine the location for the forecast.

## 5. Output Schema

- **Type**: `string`
- **Description**: A string containing a brief weather forecast (e.g., "Weather for New York: 75°F, Sunny.") or an error message if the forecast cannot be retrieved (e.g., "Could not fetch weather. API key missing or city not configured.").

## 6. Dependencies & Configuration

- **Underlying System**: Requires an external weather API (e.g., OpenWeatherMap).
- **Function**: The `getWeatherForecastFunc()` function, located in `src/tools/weatherTool.ts`, is called by `agentExecutorService.ts`.
- **Environment Variables** (from `.env` - see `docs/config.md`):
    - `WEATHER_CITY`: Must be set to the desired city (e.g., "London, UK", "Paris, FR"). If not set, the tool will return an error or indicate that the city is not configured.
    - `OPENWEATHERMAP_API_KEY` (or similar, depending on the API service chosen): Your API key for the weather service. Required for the tool to function. If missing, the tool will return an error.

## 7. When to Use (Agent Guidance)

The agent should consider using this tool when:

- Specifically asked for the weather.
- As part of assembling a daily briefing or morning report for the user.

## 8. When NOT to Use

- If the user asks for a forecast for a city *other than* the pre-configured one (this tool is not designed for ad-hoc city forecasts unless modified).
- If a weather forecast is not relevant to the user's current query. 