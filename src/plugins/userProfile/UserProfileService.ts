import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { Document } from 'langchain/document';
import {
  initUserProfileStore,
  addUserFactToProfileStore,
  retrieveUserProfileContext as retrieveContextFromStore,
} from './userProfileVectorStore';
import { LogLevel, log as logger } from '../../logger';
import { CoreServices } from '../../types/plugin';


export interface IUserProfileService {
  initialize(): Promise<void>;
  addUserFact(fact: string): Promise<void>;
  retrieveContext(query: string, k?: number): Promise<Document[]>;
  getStoreInstance(): FaissStore | null;
}

export class UserProfileService implements IUserProfileService {
  private userProfileStoreInstance: FaissStore | null = null;
  private storePath: string;
  private log: (level: LogLevel, message: string, ...args: any[]) => void;

  constructor(storePath: string, coreServices: CoreServices) {
    this.storePath = storePath;
    this.log = coreServices.log;
    this.log(LogLevel.DEBUG, `[UserProfileService] Initialized with storePath: ${storePath}`);
  }

  async initialize(): Promise<void> {
    this.log(LogLevel.INFO, `[UserProfileService] Initializing user profile store at: ${this.storePath}`);
    try {
      this.userProfileStoreInstance = await initUserProfileStore(this.storePath);
      this.log(LogLevel.INFO, `[UserProfileService] User profile store loaded/created successfully from: ${this.storePath}`);
    } catch (error: any) {
      this.log(LogLevel.ERROR, `[UserProfileService] Failed to initialize user profile store at ${this.storePath}:`, { error: error.message });
      this.userProfileStoreInstance = null;
    }
  }

  async addUserFact(fact: string): Promise<void> {
    if (!this.userProfileStoreInstance) {
      this.log(LogLevel.ERROR, '[UserProfileService] User Profile store not available for addUserFact.');
      throw new Error('User Profile store is not initialized. Cannot add fact.');
    }
    if (!this.storePath) {
        this.log(LogLevel.ERROR, '[UserProfileService] Store path is not defined. Cannot save fact.');
        throw new Error('User Profile store path is not defined. Cannot save fact.');
    }
    this.log(LogLevel.DEBUG, `[UserProfileService] Adding fact: \"${fact}\"`);
    await addUserFactToProfileStore(fact, this.userProfileStoreInstance, this.storePath);
  }

  async retrieveContext(query: string, k = 2): Promise<Document[]> {
    if (!this.userProfileStoreInstance) {
      this.log(LogLevel.ERROR, '[UserProfileService] User Profile store not available for retrieveContext.');
      return [];
    }
    this.log(LogLevel.DEBUG, `[UserProfileService] Retrieving context for query: \"${query}\", k: ${k}`);
    return retrieveContextFromStore(this.userProfileStoreInstance, query, k);
  }

  getStoreInstance(): FaissStore | null {
    return this.userProfileStoreInstance;
  }
} 