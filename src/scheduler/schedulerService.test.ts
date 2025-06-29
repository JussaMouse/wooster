import { SchedulerService, _resetForTesting } from './schedulerService';
import { SchedulerRepository } from './schedulerRepository';
import { Cron } from 'croner';
import { NewScheduleItemPayload, ScheduleItem } from '../types/schedulerCore';

jest.mock('./schedulerRepository');
jest.mock('croner');
jest.mock('../logger');

const mockCron = {
  stop: jest.fn(),
};
const CronMock = Cron as jest.Mock;
CronMock.mockImplementation(() => mockCron);

describe('SchedulerService', () => {
  let mockRepo: jest.Mocked<SchedulerRepository>;

  beforeEach(() => {
    _resetForTesting();
    jest.clearAllMocks();

    mockRepo = {
      addScheduleItem: jest.fn(),
      getScheduleItemById: jest.fn(),
      deleteScheduleItem: jest.fn(),
      getAllActiveScheduleItems: jest.fn().mockReturnValue([]),
      getScheduleItemByKey: jest.fn(),
    } as unknown as jest.Mocked<SchedulerRepository>;
    SchedulerRepository.create = jest.fn().mockResolvedValue(mockRepo);

    // After resetting modules, Cron mock needs to be re-established for each test
    CronMock.mockImplementation(() => mockCron);
  });

  describe('create', () => {
    it('should create a schedule item and schedule it', async () => {
      const newItem: NewScheduleItemPayload = {
        description: 'Test task',
        schedule_expression: '* * * * *',
        task_handler_type: 'AGENT_PROMPT',
        task_key: 'test-task',
        payload: '{"foo":"bar"}',
        execution_policy: 'DEFAULT_SKIP_MISSED',
      };

      const createdItem: ScheduleItem = {
        ...newItem,
        id: '123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
      };

      mockRepo.getScheduleItemById.mockReturnValue(createdItem);

      await SchedulerService.create(newItem);

      expect(mockRepo.addScheduleItem).toHaveBeenCalled();
      expect(mockRepo.getScheduleItemById).toHaveBeenCalled();
      expect(CronMock).toHaveBeenCalledWith(newItem.schedule_expression, expect.any(Function));
    });
  });

  describe('delete', () => {
    it('should stop the job and delete the item', async () => {
      const itemId = '123';
      
      const newItem: NewScheduleItemPayload = {
        description: 'Test task',
        schedule_expression: '* * * * *',
        task_handler_type: 'AGENT_PROMPT',
        task_key: 'test-task',
        payload: '{"foo":"bar"}',
        execution_policy: 'DEFAULT_SKIP_MISSED',
      };
      const createdItem: ScheduleItem = { ...newItem, id: itemId, created_at: '', updated_at: '', is_active: true };
      mockRepo.getScheduleItemById.mockReturnValue(createdItem);
      await SchedulerService.create(newItem);
      
      await SchedulerService.delete(itemId);
      
      expect(mockCron.stop).toHaveBeenCalled();
      expect(mockRepo.deleteScheduleItem).toHaveBeenCalledWith(itemId);
    });
  });

  describe('start', () => {
    it('should schedule all active items from the repo', async () => {
      const activeItems: ScheduleItem[] = [
        { id: '1', description: 'Active task 1', schedule_expression: '* * * * *', task_handler_type: 'AGENT_PROMPT', task_key: 'task1', is_active: true, created_at: '', updated_at: '', execution_policy: 'DEFAULT_SKIP_MISSED' },
        { id: '2', description: 'Active task 2', schedule_expression: '* * * * *', task_handler_type: 'AGENT_PROMPT', task_key: 'task2', is_active: true, created_at: '', updated_at: '', execution_policy: 'DEFAULT_SKIP_MISSED' },
      ];
      mockRepo.getAllActiveScheduleItems.mockReturnValue(activeItems);

      await SchedulerService.start();

      expect(mockRepo.getAllActiveScheduleItems).toHaveBeenCalled();
      expect(CronMock).toHaveBeenCalledTimes(2);
      expect(CronMock).toHaveBeenCalledWith(activeItems[0].schedule_expression, expect.any(Function));
      expect(CronMock).toHaveBeenCalledWith(activeItems[1].schedule_expression, expect.any(Function));
    });
  });
}); 