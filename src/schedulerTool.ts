import { DynamicTool } from "@langchain/core/tools";
import { v4 as uuidv4 } from 'uuid';
import { log, LogLevel } from "./logger";
import { SchedulerService } from "./scheduler/schedulerService";
import { parseDateString } from "./scheduler/scheduleParser";

interface ScheduleAgentTaskArgs {
  taskPayload: string;
  timeExpression: string;
  humanReadableDescription: string;
}

export async function scheduleAgentTask(args: ScheduleAgentTaskArgs): Promise<string> {
  const { taskPayload, timeExpression, humanReadableDescription } = args;
  log(LogLevel.INFO, '[Tool:scheduleAgentTask] Called with parsed/validated args:', { taskPayload, timeExpression, humanReadableDescription });

  if (!taskPayload || typeof taskPayload !== 'string' || 
      !timeExpression || typeof timeExpression !== 'string' || 
      !humanReadableDescription || typeof humanReadableDescription !== 'string') {
    log(LogLevel.WARN, '[Tool:scheduleAgentTask] Missing or invalid type for required arguments.', args);
    return "Error: Missing or invalid arguments. 'taskPayload', 'timeExpression', and 'humanReadableDescription' are required strings.";
  }

  const scheduleDate = parseDateString(timeExpression);

  if (!scheduleDate) {
    log(LogLevel.WARN, '[Tool:scheduleAgentTask] Could not parse timeExpression.', { timeExpression });
    return `Error: Could not parse the time expression "${timeExpression}". Please use a clearer format (e.g., 'tomorrow at 5pm', 'in 2 hours').`;
  }
  
  if (scheduleDate.getTime() < Date.now()) {
    log(LogLevel.WARN, '[Tool:scheduleAgentTask] Attempted to schedule in the past.', { scheduleDate: scheduleDate.toLocaleString(), timeExpression });
    return `Error: The specified time "${timeExpression}" is in the past. Please provide a future time.`;
  }

  const taskKey = 'agent.respond';
  
  log(LogLevel.DEBUG, '[Tool:scheduleAgentTask] Calling SchedulerService.create', { description: humanReadableDescription, scheduleDate, taskPayload, taskKey });
  
  try {
    const newSchedule = await SchedulerService.create({
      description: humanReadableDescription,
      schedule_expression: scheduleDate.toISOString(),
      task_handler_type: 'AGENT_PROMPT',
      task_key: taskKey, 
      payload: JSON.stringify(taskPayload), 
      execution_policy: 'DEFAULT_SKIP_MISSED'
    });

    if (newSchedule && newSchedule.id) {
      const confirmationMessage = `Task "${humanReadableDescription}" has been scheduled successfully for ${scheduleDate.toLocaleString()}.`;
      log(LogLevel.INFO, '[Tool:scheduleAgentTask] Task scheduled successfully.', { scheduleId: newSchedule.id, confirmationMessage });
      return confirmationMessage;
    } else {
      log(LogLevel.ERROR, '[Tool:scheduleAgentTask] SchedulerService.create returned null or schedule without ID.', { args, newSchedule });
      return "Error: Failed to schedule task. The scheduler service did not confirm the task creation.";
    }
  } catch (error: any) {
    log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Error during execution:', { errorMessage: error.message, errorStack: error.stack, args });
    return "An unexpected error occurred while scheduling the task.";
  }
}

export const scheduleAgentTaskTool = new DynamicTool({
  name: 'scheduleAgentTask',
  description: "Schedules a task for the agent to perform at a specified future time. " +
               "Input MUST be a valid JSON object with three string keys: 'taskPayload', 'timeExpression', and 'humanReadableDescription'. " +
               "Example: { \"taskPayload\": \"Send a happy birthday email to John\", \"timeExpression\": \"tomorrow at 9am\", \"humanReadableDescription\": \"Schedule birthday email for John\" }. " +
               "'taskPayload' is the core task for the agent to execute (e.g., 'What is the weather in London?'). " +
               "'timeExpression' is a natural language expression for when the task should run (e.g., 'in 2 hours', 'next Friday at 3 PM'). " +
               "'humanReadableDescription' is a brief summary of the task (e.g., 'Check London weather').",
  func: async (toolInput: string | Record<string, any>): Promise<string> => {
    let args: ScheduleAgentTaskArgs;

    if (typeof toolInput === 'string') {
      try {
        args = JSON.parse(toolInput) as ScheduleAgentTaskArgs;
      } catch (e) {
        log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Failed to parse JSON input string', { input: toolInput, error: (e as Error).message });
        if (!toolInput.startsWith('{') || !toolInput.endsWith('}')) {
          return `Error: Input was a plain string, but a JSON object is required. The string '${toolInput}' looks like it might be the 'taskPayload'. Please provide a JSON object with 'taskPayload', 'timeExpression', and 'humanReadableDescription' keys. Example: { "taskPayload": "${toolInput}", "timeExpression": "your time here", "humanReadableDescription": "your description here" }`;
        }
        return "Error: Invalid input. Input string is not valid JSON. Expected a JSON object with 'taskPayload', 'timeExpression', and 'humanReadableDescription'.";
      }
    } else if (typeof toolInput === 'object' && toolInput !== null) {
      args = toolInput as ScheduleAgentTaskArgs;
    } else {
      log(LogLevel.ERROR, '[Tool:scheduleAgentTask] Invalid input type.', { input: toolInput });
      return "Error: Invalid input type for scheduleAgentTask. Expected a JSON string or a JSON object.";
    }

    return scheduleAgentTask(args);
  },
}); 