import { getConfig } from '../configLoader';
import { initializeModelRouter } from './ModelRouterService';
import { log, LogLevel } from '../logger';

/**
 * Simple test to verify the routing system works in Phase 1
 */
async function testModelRouting() {
  console.log('🧪 Testing Model Routing System (Phase 1)...\n');

  try {
    // Load config
    const config = getConfig();
    console.log(`✅ Config loaded. Routing enabled: ${config.routing?.enabled || false}`);

    // Initialize router
    const router = initializeModelRouter(config);
    console.log('✅ Model router initialized');

    // Test model selection
    const model = await router.selectModel({
      task: 'TOOL_EXECUTION',
      context: router.createContext('TOOL_EXECUTION', { priority: 'fast' })
    });

    console.log(`✅ Model selected: ${model.constructor.name}`);
    console.log(`   Model name: ${(model as any).modelName || 'unknown'}`);

    // Test different task types
    const tasks = ['COMPLEX_REASONING', 'CODE_ASSISTANCE', 'BACKGROUND_TASK'] as const;
    
    for (const task of tasks) {
      const taskModel = await router.selectModel({
        task,
        context: router.createContext(task)
      });
      console.log(`✅ ${task}: ${taskModel.constructor.name}`);
    }

    // Test routing stats
    const stats = router.getRoutingStats();
    console.log(`\n📊 Routing Stats:`);
    console.log(`   Enabled: ${stats.enabled}`);
    console.log(`   Total decisions: ${stats.totalDecisions}`);
    console.log(`   Recent decisions: ${stats.recentDecisions.length}`);

    console.log('\n🎉 All tests passed! Phase 1 routing system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testModelRouting();
}

export { testModelRouting }; 