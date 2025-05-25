import { AgentTool } from "../agent";
import { log, LogLevel } from '../logger';
import { createAgentTaskSchedule } from "../scheduler/schedulerService"; // Should be the ONLY import from schedulerService
import { parseDateString } from "../scheduler/scheduleParser";   // Should be the ONLY import from scheduleParser for date parsing

interface ScheduleAgentTaskArgs {
  taskPayload: string;
  timeExpression: string;
  humanReadableDescription: string;
}

export const scheduleAgentTask: AgentTool = {
  name: 'scheduleAgentTask',
  description: "Schedules a task for the agent to perform at a specified future time. The agent should provide the core task, a natural language time expression, and a human-readable description.",
  parameters: {
    type: "object",
    properties: {
      taskPayload: { 
        type: "string", 
        description: "The core task or query for the agent to execute at the scheduled time (e.g., 'What is the weather in London?', or 'Send an email to mom saying happy birthday.'). This should be the underlying request, stripped of the scheduling instruction itself." 
      },
      timeExpression: { 
        type: "string", 
        description: "A natural language expression for when the task should run (e.g., 'tomorrow at 10am', 'in 2 hours', 'next Monday at noon')." 
      },
      humanReadableDescription: { 
        type: "string", 
        description: "A brief, human-readable description of the task being scheduled (e.g., 'Check London weather', 'Email mom for birthday')." 
      }
    },
    required: ["taskPayload", "timeExpression", "humanReadableDescription"]
  },
  execute: async (args: ScheduleAgentTaskArgs): Promise<string> => {
    const { taskPayload, timeExpression, humanReadableDescription } = args;
    log(LogLevel.INFO, '[Tool:scheduleAgentTask] Called', { taskPayload, timeExpression, humanReadableDescription });

    if (!taskPayload || !timeExpression || !humanReadableDescription) {
      log(LogLevel.WARN, '[Tool:scheduleAgentTask] Missing required arguments.', args);
      return "Missing required arguments for scheduling. I need a task, a time, and a description.";
    }

    const scheduleDate = parseDateString(timeExpression);

    if (!scheduleDate) {
      log(LogLevel.WARN, '[Tool:scheduleAgentTask] Could not parse timeExpression.', { timeExpression });
      return `Could not understand the time expression: "${timeExpression}". Please try a different phrasing.`;
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
        const confirmationMessage = `Okay, I've scheduled "${humanReadableDescription}" for ${scheduleDate.toLocaleString()}. (ID: ${reminder.id})`;
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
}; 