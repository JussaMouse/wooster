import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { AppConfig } from '../../configLoader';
import { log, LogLevel } from '../../logger';
import { initUserProfileStore, addTextToUserProfile, searchUserProfile } from './userProfileVectorStore';

export interface IUserProfileService {
  add(text: string, metadata?: object): Promise<void>;
  query(query: string, k?: number): Promise<Array<{ pageContent: string; metadata: object }>>;
  getStoreInstance(): MemoryVectorStore | null;
}

export class UserProfileService implements IUserProfileService {
  private static instance: UserProfileService;
  private isInitialized = false;
  private userProfileStoreInstance: MemoryVectorStore | null = null;
  private storePath: string;

  private constructor(config: AppConfig) {
    if (!config.userProfile.storePath) {
      throw new Error("User profile store path is not configured.");
    }
    this.storePath = config.userProfile.storePath;
  }

  public static getInstance(config: AppConfig): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService(config);
    }
    return UserProfileService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      log(LogLevel.INFO, 'User profile service already initialized.');
      return;
    }
    try {
      this.userProfileStoreInstance = await initUserProfileStore(this.storePath);
      this.isInitialized = true;
      log(LogLevel.INFO, 'User profile service initialized successfully.');
    } catch (error) {
      log(LogLevel.ERROR, 'Failed to initialize user profile service', { error });
      throw error;
    }
  }

  getStoreInstance(): MemoryVectorStore | null {
    return this.userProfileStoreInstance;
  }

  async add(text: string, metadata: object = {}): Promise<void> {
    if (!this.isInitialized || !this.userProfileStoreInstance) {
      throw new Error("User profile service is not initialized.");
    }
    await addTextToUserProfile(this.userProfileStoreInstance, text, metadata, this.storePath);
  }

  async query(query: string, k: number = 3): Promise<Array<{ pageContent: string; metadata: object }>> {
    if (!this.isInitialized || !this.userProfileStoreInstance) {
      throw new Error("User profile service is not initialized.");
    }
    return searchUserProfile(this.userProfileStoreInstance, query, k);
  }
} 