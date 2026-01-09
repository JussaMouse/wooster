/**
 * Memory Services for Wooster
 * 
 * This module provides enhanced memory capabilities:
 * - EpisodicMemory: Stores and recalls conversation summaries
 * - SemanticProfile: Stores structured facts about the user
 * - SessionState: Combines both for "where we left off" context
 */

export {
  EpisodicMemory,
  Episode,
  EpisodicMemoryConfig,
  getEpisodicMemory,
  initializeEpisodicMemory
} from './EpisodicMemory';

export {
  SemanticProfile,
  UserFact,
  FactCategory,
  SemanticProfileConfig,
  getSemanticProfile,
  initializeSemanticProfile
} from './SemanticProfile';

export {
  SessionState,
  SessionContext,
  SessionStateConfig,
  getSessionState,
  initializeSessionState,
  resetSessionState
} from './SessionState';
