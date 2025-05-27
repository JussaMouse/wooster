import { DynamicTool } from "@langchain/core/tools";
import { log, LogLevel } from '../logger';
import { createAgentTaskSchedule } from "../scheduler/schedulerService"; // Should be the ONLY import from schedulerService
import { parseDateString } from "../scheduler/scheduleParser";   // Should be the ONLY import from scheduleParser for date parsing

interface ScheduleAgentTaskArgs {
  taskPayload: string;
  timeExpression: string;
  humanReadableDescription: string;
}

export const scheduleAgentTaskTool = new DynamicTool({
  name: 'scheduleAgentTask',
  description: "Schedules a task for the agent to perform at a specified future time. Input MUST be an object with three keys: 'taskPayload' (string: the core task for the agent to execute later, e.g., 'What is the weather in London?'), 'timeExpression' (string: a natural language expression for when the task should run, e.g., 'tomorrow at 10am', 'in 2 hours'), and 'humanReadableDescription' (string: a brief description of the task, e.g., 'Check London weather').",
  // DynamicTool func receives a string or an object based on how the LLM calls it.
  // We will parse it if it's a string, otherwise use as is if an object.
  func: async (toolInput: string | Record<string, any>): Promise<string> => {
    let args: ScheduleAgentTaskArgs;
    if (typeof toolInput === 'string') {
      try {
        args = JSON.parse(toolInput) as ScheduleAgentTaskArgs;
      } catch (e) {
        log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Failed to parse JSON input string', { input: toolInput, error: (e as Error).message });
        return "Invalid input for scheduleAgentTask: Input string is not valid JSON. Expected object with 'taskPayload', 'timeExpression', 'humanReadableDescription'.";
      }
    } else if (typeof toolInput === 'object' && toolInput !== null) {
      // Type assertion, as we expect the LLM to provide the correct structure if it passes an object.
      args = toolInput as ScheduleAgentTaskArgs;
    } else {
      log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Invalid input type.', { input: toolInput });
      return "Invalid input type for scheduleAgentTask. Expected JSON string or object.";
    }

    const { taskPayload, timeExpression, humanReadableDescription } = args;
    log(LogLevel.INFO, '[Tool:scheduleAgentTask] Called', { taskPayload, timeExpression, humanReadableDescription });

    if (!taskPayload || !timeExpression || !humanReadableDescription) {
      log(LogLevel.WARN, '[Tool:scheduleAgentTask] Missing required arguments.', args);
      return "Missing required arguments. I need 'taskPayload', 'timeExpression', and 'humanReadableDescription'.";
    }

    const scheduleDate = parseDateString(timeExpression);

    if (!scheduleDate) {
      log(LogLevel.WARN, '[Tool:scheduleAgentTask] Could not parse timeExpression.', { timeExpression });
      return `Could not understand the time expression: \"${timeExpression}\". Please try a different phrasing.`;
    }

    if (scheduleDate.getTime() <= Date.now()) {
      log(LogLevel.WARN, '[Tool:scheduleAgentTask] Attempted to schedule in the past.', { scheduleDate: scheduleDate.toLocaleString(), timeExpression });
      return `The specified time (${scheduleDate.toLocaleString()}) is in the past. Please provide a future time.`;
    }

    try {
      log(LogLevel.DEBUG, '[Tool:scheduleAgentTask] Calling createAgentTaskSchedule', { humanReadableDescription, scheduleDate, taskPayload });
      const reminder = await createAgentTaskSchedule(
        humanReadableDescription, 
        scheduleDate,
        taskPayload 
      );

      if (reminder && reminder.id) {
        const confirmationMessage = `Okay, I've scheduled \"${humanReadableDescription}\" for ${scheduleDate.toLocaleString()}. (ID: ${reminder.id})`;
        log(LogLevel.INFO, '[Tool:scheduleAgentTask] Task scheduled successfully.', { reminderId: reminder.id, confirmationMessage });
        return confirmationMessage;
      } else {
        log(LogLevel.ERROR, '[Tool:scheduleAgentTask] createAgentTaskSchedule returned null or reminder without ID.', { args, reminder });
        return "There was an unexpected error scheduling your task. Please try again.";
      }
    } catch (error: any) {
      log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Error during execution:', { errorMessage: error.message, errorStack: error.stack, args });
      return `Failed to schedule task due to an internal error: ${error.message}`;
    }
  }
}); 