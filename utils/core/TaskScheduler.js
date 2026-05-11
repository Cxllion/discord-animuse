const logger = require('./logger');

/**
 * Advanced Task Scheduler for AniMuse V2
 * Manages background jobs with telemetry, concurrency safety, and graceful lifecycle control.
 */
class TaskScheduler {
    constructor(client) {
        this.client = client;
        this.tasks = new Map();
        this.intervals = new Map();
    }

    /**
     * Register a new background task
     * @param {string} name - Task identifier
     * @param {Function} fn - The async function to execute
     * @param {number} intervalMs - Recurrence interval in milliseconds
     * @param {Object} options - Additional options (immediate: boolean, testModeSafe: boolean)
     */
    addTask(name, fn, intervalMs, options = {}) {
        if (this.tasks.has(name)) {
            logger.warn(`Task ${name} is already registered. Skipping.`, 'Scheduler');
            return;
        }

        const taskInfo = {
            name,
            fn,
            intervalMs,
            options,
            lastPulse: null,
            isRunning: false,
            failures: 0,
            consecutiveFailures: 0
        };

        this.tasks.set(name, taskInfo);

        // Don't start tasks in test mode unless explicitly allowed
        if (this.client.isTestBot && !options.testModeSafe) {
            logger.debug(`Task ${name} suppressed (Test Mode).`, 'Scheduler');
            return;
        }

        const runTask = async () => {
            if (taskInfo.isRunning) return;
            taskInfo.isRunning = true;

            try {
                logger.debug(`[Task] Starting: ${name}`, 'Scheduler');
                await fn(this.client);
                taskInfo.lastPulse = Date.now();
                taskInfo.consecutiveFailures = 0;
            } catch (err) {
                taskInfo.failures++;
                taskInfo.consecutiveFailures++;
                logger.error(`Task ${name} failed (Attempt ${taskInfo.consecutiveFailures})`, err, 'Scheduler');
            } finally {
                taskInfo.isRunning = false;
            }
        };

        // Initial Run
        if (options.immediate) {
            runTask();
        }

        // Setup Interval
        const interval = setInterval(() => {
            runTask();
        }, intervalMs);

        this.intervals.set(name, interval);
        
        // 🛡️ [Cyber Librarian] Register with client for global shutdown tracking
        if (this.client.intervals) {
            this.client.intervals.push(interval);
        }
        
        logger.info(`Registered background task: ${name} (${intervalMs / 1000}s)`, 'Scheduler');
    }

    /**
     * Stop all scheduled tasks
     */
    stopAll() {
        this.intervals.forEach(clearInterval);
        this.intervals.clear();
        this.tasks.clear();
        logger.info('All background tasks terminated.', 'Scheduler');
    }

    /**
     * Get detailed telemetry for all tasks
     */
    getTelemetry() {
        const report = [];
        for (const [name, info] of this.tasks) {
            report.push({
                name: info.name,
                status: info.isRunning ? 'RUNNING' : 'IDLE',
                lastPulse: info.lastPulse ? new Date(info.lastPulse).toISOString() : 'NEVER',
                failures: info.failures,
                interval: `${info.intervalMs / 1000}s`
            });
        }
        return report;
    }
}

module.exports = TaskScheduler;
