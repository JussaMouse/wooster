export type TaskHandlerType = 'AGENT_PROMPT' | 'DIRECT_FUNCTION';
export type TaskExecutionStatus = 'SUCCESS' | 'FAILURE' | 'SKIPPED_DUPLICATE';
export type ExecutionPolicyType = 'DEFAULT_SKIP_MISSED' | 'RUN_ONCE_PER_PERIOD_CATCH_UP' | 'RUN_IMMEDIATELY_IF_MISSED';

export interface ScheduleItem {
  id: string;
  description: string;
  schedule_expression: string;
  payload?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  next_run_time?: string | null;
  last_invocation?: string | null;

  task_key: string;
  task_handler_type: TaskHandlerType;
  execution_policy: ExecutionPolicyType;
}

export type NewScheduleItemPayload = Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'last_invocation' | 'next_run_time'>;

export type UpdateScheduleItemArgs = Partial<Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>> & { updated_at?: string };

export interface TaskExecutionLogEntry {
  id?: number;
  schedule_id: string;
  period_identifier: string;
  status: TaskExecutionStatus;
  executed_at: string;
  notes?: string | null;
} 