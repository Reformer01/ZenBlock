// ZenBlock Recovery and Fallback Mechanisms
// Provides robust error recovery and fallback functionality

const RECOVERY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  BACKUP_STORAGE_KEY: 'zenblock_backup',
  HEALTH_CHECK_INTERVAL: 60000, // 1 minute
  CRITICAL_ERROR_THRESHOLD: 5
};

class ZenBlockRecovery {
  constructor() {
    this.errorCount = 0;
    this.lastHealthCheck = Date.now();
    this.isRecoveryMode = false;
    this.backupData = null;
    this.retryQueue = [];
  }

  // Initialize recovery system
  async initialize() {
    try {
      console.log('ZenBlock Recovery System initializing...');
      
      // Load backup data if available
      await this.loadBackupData();
      
      // Set up health monitoring
      this.startHealthMonitoring();
      
      // Set up error handlers
      this.setupErrorHandlers();
      
      console.log('ZenBlock Recovery System initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize recovery system:', error);
      this.enterRecoveryMode();
    }
  }

  // Load backup data from storage
  async loadBackupData() {
    try {
      const result = await chrome.storage.local.get([RECOVERY_CONFIG.BACKUP_STORAGE_KEY]);
      this.backupData = result[RECOVERY_CONFIG.BACKUP_STORAGE_KEY] || this.createDefaultBackup();
      
      // Validate backup data
      if (!this.validateBackupData(this.backupData)) {
        console.warn('Invalid backup data, creating new backup');
        this.backupData = this.createDefaultBackup();
        await this.saveBackupData();
      }
      
    } catch (error) {
      console.error('Failed to load backup data:', error);
      this.backupData = this.createDefaultBackup();
    }
  }

  // Create default backup data
  createDefaultBackup() {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      settings: {
        isEnabled: true,
        whitelist: [],
        blockedCount: 0,
        filterLists: { easyList: true, privacyList: false }
      },
      fallbackRules: [
        '||doubleclick.net^',
        '||googlesyndication.com^',
        '||googleadservices.com^',
        '||googletagmanager.com^',
        '||google-analytics.com^'
      ]
    };
  }

  // Validate backup data structure
  validateBackupData(data) {
    return data && 
           typeof data === 'object' &&
           data.settings &&
           typeof data.settings.isEnabled === 'boolean' &&
           Array.isArray(data.settings.whitelist) &&
           typeof data.settings.blockedCount === 'number';
  }

  // Save backup data to storage
  async saveBackupData() {
    try {
      this.backupData.timestamp = Date.now();
      await chrome.storage.local.set({
        [RECOVERY_CONFIG.BACKUP_STORAGE_KEY]: this.backupData
      });
    } catch (error) {
      console.error('Failed to save backup data:', error);
    }
  }

  // Start health monitoring
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthCheck();
    }, RECOVERY_CONFIG.HEALTH_CHECK_INTERVAL);
  }

  // Perform health check
  async performHealthCheck() {
    try {
      const now = Date.now();
      const timeSinceLastCheck = now - this.lastHealthCheck;
      
      // Check extension health
      const health = await this.checkExtensionHealth();
      
      if (!health.isHealthy) {
        console.warn('Health check failed:', health.issues);
        this.handleHealthIssue(health.issues);
      }
      
      // Reset error count if health is good
      if (health.isHealthy && this.errorCount > 0) {
        this.errorCount = Math.max(0, this.errorCount - 1);
      }
      
      this.lastHealthCheck = now;
      
    } catch (error) {
      console.error('Health check failed:', error);
      this.errorCount++;
    }
  }

  // Check extension health
  async checkExtensionHealth() {
    const issues = [];
    
    try {
      // Check storage accessibility
      await chrome.storage.sync.get(['test']);
      
      // Check declarativeNetRequest API
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      
      // Check background script connectivity
      const response = await chrome.runtime.sendMessage({ action: 'ping' });
      
      if (!response) {
        issues.push('Background script not responding');
      }
      
    } catch (error) {
      issues.push(`API error: ${error.message}`);
    }
    
    return {
      isHealthy: issues.length === 0,
      issues: issues
    };
  }

  // Handle health issues
  handleHealthIssue(issues) {
    this.errorCount++;
    
    if (this.errorCount >= RECOVERY_CONFIG.CRITICAL_ERROR_THRESHOLD) {
      console.error('Critical error threshold reached, entering recovery mode');
      this.enterRecoveryMode();
    }
    
    // Attempt specific recovery based on issues
    issues.forEach(issue => {
      if (issue.includes('Background script')) {
        this.restartBackgroundScript();
      } else if (issue.includes('API error')) {
        this.resetAPIConnections();
      }
    });
  }

  // Enter recovery mode
  async enterRecoveryMode() {
    if (this.isRecoveryMode) return;
    
    console.warn('Entering recovery mode');
    this.isRecoveryMode = true;
    
    try {
      // Apply fallback settings
      await this.applyFallbackSettings();
      
      // Reset error state
      this.errorCount = 0;
      
      // Notify user if needed
      this.notifyUser('ZenBlock is running in recovery mode');
      
    } catch (error) {
      console.error('Failed to enter recovery mode:', error);
    }
  }

  // Apply fallback settings
  async applyFallbackSettings() {
    try {
      const settings = this.backupData.settings;
      
      // Apply basic blocking rules
      await this.applyFallbackRules();
      
      // Restore essential settings
      await chrome.storage.sync.set({
        isEnabled: settings.isEnabled,
        whitelist: settings.whitelist,
        blockedCount: settings.blockedCount
      });
      
      console.log('Fallback settings applied successfully');
      
    } catch (error) {
      console.error('Failed to apply fallback settings:', error);
    }
  }

  // Apply fallback blocking rules
  async applyFallbackRules() {
    try {
      const fallbackRules = this.backupData.fallbackRules.map((domain, index) => ({
        id: 9000 + index,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: domain,
          resourceTypes: ['script', 'image', 'stylesheet']
        }
      }));
      
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: fallbackRules.map(rule => rule.id),
        addRules: fallbackRules
      });
      
      console.log(`Applied ${fallbackRules.length} fallback rules`);
      
    } catch (error) {
      console.error('Failed to apply fallback rules:', error);
    }
  }

  // Restart background script
  async restartBackgroundScript() {
    try {
      console.log('Attempting to restart background script...');
      
      // Clear any stuck states
      await chrome.storage.local.remove(['background_state']);
      
      // Send restart signal
      await chrome.runtime.sendMessage({ action: 'restart' });
      
    } catch (error) {
      console.error('Failed to restart background script:', error);
    }
  }

  // Reset API connections
  async resetAPIConnections() {
    try {
      console.log('Resetting API connections...');
      
      // Clear dynamic rules
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: 10000 }, (_, i) => i + 1)
      });
      
      // Reapply fallback rules
      await this.applyFallbackRules();
      
    } catch (error) {
      console.error('Failed to reset API connections:', error);
    }
  }

  // Setup error handlers
  setupErrorHandlers() {
    // Handle uncaught errors
    self.addEventListener('error', (event) => {
      console.error('Uncaught error:', event.error);
      this.handleError(event.error);
    });
    
    // Handle unhandled promise rejections
    self.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleError(event.reason);
    });
  }

  // Handle errors
  handleError(error) {
    this.errorCount++;
    
    // Log error details
    console.error('ZenBlock error handled:', {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      errorCount: this.errorCount
    });
    
    // Check if recovery mode is needed
    if (this.errorCount >= RECOVERY_CONFIG.CRITICAL_ERROR_THRESHOLD) {
      this.enterRecoveryMode();
    }
  }

  // Add operation to retry queue
  async addToRetryQueue(operation, maxRetries = RECOVERY_CONFIG.MAX_RETRIES) {
    return new Promise((resolve, reject) => {
      this.retryQueue.push({
        operation,
        maxRetries,
        currentRetries: 0,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      this.processRetryQueue();
    });
  }

  // Process retry queue
  async processRetryQueue() {
    if (this.retryQueue.length === 0) return;
    
    const item = this.retryQueue[0];
    
    try {
      const result = await item.operation();
      item.resolve(result);
      this.retryQueue.shift();
      
    } catch (error) {
      item.currentRetries++;
      
      if (item.currentRetries >= item.maxRetries) {
        item.reject(error);
        this.retryQueue.shift();
      } else {
        // Retry after delay
        setTimeout(() => {
          this.processRetryQueue();
        }, RECOVERY_CONFIG.RETRY_DELAY * item.currentRetries);
      }
    }
  }

  // Notify user (if needed)
  notifyUser(message) {
    try {
      // Send notification to popup
      chrome.runtime.sendMessage({
        action: 'notification',
        message: message,
        type: 'warning'
      });
    } catch (error) {
      console.error('Failed to notify user:', error);
    }
  }

  // Get recovery status
  getStatus() {
    return {
      isRecoveryMode: this.isRecoveryMode,
      errorCount: this.errorCount,
      lastHealthCheck: this.lastHealthCheck,
      retryQueueLength: this.retryQueue.length,
      backupTimestamp: this.backupData?.timestamp
    };
  }

  // Manual recovery trigger
  async triggerRecovery() {
    console.log('Manual recovery triggered');
    await this.enterRecoveryMode();
  }

  // Clear all data and reset
  async resetAllData() {
    try {
      console.warn('Resetting all ZenBlock data...');
      
      // Clear all storage
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Clear all rules
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: 10000 }, (_, i) => i + 1)
      });
      
      // Reset recovery system
      this.errorCount = 0;
      this.isRecoveryMode = false;
      this.backupData = this.createDefaultBackup();
      await this.saveBackupData();
      
      // Reinitialize
      await this.initialize();
      
      console.log('ZenBlock data reset completed');
      
    } catch (error) {
      console.error('Failed to reset all data:', error);
    }
  }
}

// Initialize recovery system
const recovery = new ZenBlockRecovery();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZenBlockRecovery;
}

// Auto-initialize
recovery.initialize().catch(console.error);
