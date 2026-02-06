import { config } from 'dotenv';
config(); // Load environment variables

import { messageProcessor } from '../queue/workers/message-processor';

// Worker management
class WorkerManager {
  private workers: Map<string, any> = new Map();
  private isShuttingDown = false;

  /**
   * Initialize all workers
   */
  async initialize(): Promise<void> {
    console.log('Initializing workers...');

    // Start message processor
    await messageProcessor.start();
    this.workers.set('messageProcessor', messageProcessor);

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    console.log('All workers initialized successfully');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    console.log('Shutting down workers...');
    this.isShuttingDown = true;

    // Stop all workers
    for (const [name, worker] of this.workers) {
      try {
        if (worker.stop) {
          await worker.stop();
          console.log(`${name} stopped`);
        }
      } catch (error) {
        console.error(`Error stopping ${name}:`, error);
      }
    }

    console.log('All workers stopped');
    process.exit(0);
  }

  /**
   * Get worker status
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, worker] of this.workers) {
      status[name] = {
        running: worker.isRunning || false,
        // Add more status details as needed
      };
    }

    return status;
  }
}

// Export singleton instance
export const workerManager = new WorkerManager();

// Auto-initialize if this file is imported directly
if (require.main === module) {
  workerManager.initialize().catch(console.error);
}
