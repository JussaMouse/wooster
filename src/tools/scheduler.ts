import { AgentTool } from '../agent';
import { createAgentTaskSchedule } from '../scheduler/schedulerService';
import { parseReminderTextAndDate } from '../scheduler/scheduleParser';
import { ChatOpenAI } from '@langchain/openai'; // For type hint if llm is passed to execute

export const scheduleAgentTask: AgentTool = {
  name: 'scheduleAgentTask',
  description:
    'Schedules a task to be performed by the agent at a specified time. Input must be the full natural language request that specifies both the task and the time (e.g., "email me the project status update tomorrow at 9am", "remind me to call support in 3 hours").',
  parameters: {
    type: "object",
    properties: {
      userInput: { 
        type: "string", 
        description: "The full natural language request for scheduling a task, including what to do and when. E.g., 'email me the weather report tomorrow at 6am' or 'remind me to check the project status in 2 hours'." 
      },
    },
    required: ["userInput"],
  },
  execute: async (args: { userInput: string }, llm?: ChatOpenAI): Promise<string> => {
    console.log(`scheduleAgentTask execute with userInput: "${args.userInput}"`);
    try {
      const parsed = parseReminderTextAndDate(args.userInput);
      if (!parsed) {
        return 'Could not understand the time or task for the schedule. Please be more specific with your request (e.g., "remind me to X tomorrow at Y").';
      }

      const { reminderText: taskName, date: scheduleDate } = parsed;

      if (!taskName || !scheduleDate) {
        return 'Failed to parse the task or date from your request. Please specify what to do and when (e.g., "remind me to X tomorrow at Y").';
      }
      
      if (scheduleDate.getTime() <= Date.now()) {
        return `The specified time (${scheduleDate.toLocaleString()}) is in the past. Please provide a future time.`;
      }

      // The taskName is the human-readable description parsed from the input.
      // For agentIntent, the task_payload will be the original user input that was scheduled.
      const reminder = await createAgentTaskSchedule(
        taskName, 
        scheduleDate, 
        args.userInput // task_payload: Use the original full user input for re-processing
      );

      if (reminder && reminder.id) {
        let confirmationMessage = `Okay, I've scheduled the task: "${taskName}" for ${scheduleDate.toLocaleString()}. Reminder ID: ${reminder.id}`;
        const taskNameLower = taskName.toLowerCase();
        if ((taskNameLower.includes('email') || taskNameLower.includes('send')) && (taskNameLower.includes(' me') || taskNameLower.includes(' my ') || taskNameLower.includes('myself'))) {
          const userEmail = process.env.USER_EMAIL_ADDRESS;
          if (userEmail) {
            confirmationMessage += ` (Note: If this task involves sending an email to "me", it will be attempted to your configured address: ${userEmail}).`;
          } else {
            confirmationMessage += ` (Note: If this task involves sending an email to "me", USER_EMAIL_ADDRESS is not set in .env, so it may fail or require a specific recipient).`;
          }
        }
        return confirmationMessage;
      } else {
        return 'There was an unexpected error scheduling your task. It might be because the time was in the past or another issue occurred.';
      }
    } catch (error: any) {
      console.error('Error in scheduleAgentTask:', error);
      return `Error scheduling task: ${error.message}. Please ensure your request is clear (e.g., "remind me to X tomorrow at Y").`;
    }
  },
}; 