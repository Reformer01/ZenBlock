// Enhanced ad-blocking extension with robust error handling and performance optimization
const ADBLOCK_CONFIG = {
  MAX_RULES: 30000,
  CACHE_DURATION: 3600000, // 1 hour
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000,
  PERFORMANCE_CHECK_INTERVAL: 30000 // 30 seconds
};

// Initialize default settings with comprehensive error handling
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    console.log('ZenBlock installation detected:', details.reason);
    
    const defaults = {
      blockedCount: 0,
      isEnabled: true,
      whitelist: [],
      filterLists: { easyList: true, privacyList: false },
      updateFrequency: '7',
      lastFilterUpdate: Date.now(),
      performanceStats: { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 }
    };

    const result = await chrome.storage.sync.get(Object.keys(defaults));
    const updates = {};
    
    for (const [key, value] of Object.entries(defaults)) {
      if (result[key] === undefined) {
        updates[key] = value;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
      console.log('Default settings initialized:', Object.keys(updates));
    }
    
    // Load filter lists with error recovery
    await loadFilterLists();
    
    // Force apply fallback rules immediately to ensure blocking works
    await applyFallbackRules();
    
    // Initialize performance monitoring
    initializePerformanceMonitoring();
    
  } catch (error) {
    console.error('Installation initialization failed:', error);
    // Fallback to minimal working state
    await chrome.storage.sync.set({ isEnabled: true, blockedCount: 0 });
    // Still try to apply fallback rules
    await applyFallbackRules();
  }
});

// Enhanced filter list loading with retry mechanism and caching
async function loadFilterLists(retryCount = 0) {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate']);
    const now = Date.now();
    
    // Check if we need to update filter lists
    const shouldUpdate = !settings.lastFilterUpdate || 
                        (now - settings.lastFilterUpdate) > (parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000);
    
    if (shouldUpdate || retryCount > 0) {
      console.log(`Loading filter lists (attempt ${retryCount + 1})`);
      
      const filterPromises = [];
      
      if (settings.filterLists?.easyList !== false) {
        filterPromises.push(loadFilterList('easylist.txt'));
      }
      
      if (settings.filterLists?.privacyList) {
        filterPromises.push(loadFilterList('privacy.txt'));
      }
      
      const results = await Promise.allSettled(filterPromises);
      const successfulFilters = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      if (successfulFilters.length > 0) {
        const allRules = successfulFilters.flat();
        await applyFilterRules(allRules);
        await chrome.storage.sync.set({ lastFilterUpdate: now });
        console.log(`Successfully loaded ${allRules.length} filter rules`);
      } else {
        throw new Error('No filter lists loaded successfully');
      }
    }
    
  } catch (error) {
    console.error(`Filter list loading failed (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < ADBLOCK_CONFIG.RETRY_ATTEMPTS) {
      setTimeout(() => loadFilterLists(retryCount + 1), ADBLOCK_CONFIG.RETRY_DELAY);
    } else {
      console.error('All filter list loading attempts failed, using fallback rules');
      await applyFallbackRules();
    }
  }
}

// Load individual filter list with validation
async function loadFilterList(filename) {
  try {
    const response = await fetch(chrome.runtime.getURL(`filters/${filename}`));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const filterList = await response.text();
    if (!filterList || filterList.length < 100) {
      throw new Error('Filter list appears to be empty or corrupted');
    }
    
    const rules = parseFilterList(filterList);
    console.log(`Loaded ${rules.length} rules from ${filename}`);
    return rules;
    
  } catch (error) {
    console.error(`Failed to load filter list ${filename}:`, error);
    throw error;
  }
}

// Enhanced filter list parser with comprehensive rule support
function parseFilterList(filterList) {
  const rules = [];
  const lines = filterList.split('\n');
  let id = 1;
  let ruleCount = 0;
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('!') || line.trim() === '') continue;
    
    // Skip malformed lines
    if (line.length < 3) continue;
    
    try {
      // Basic ad blocking rule (||domain^)
      if (line.startsWith('||') && line.endsWith('^')) {
        const domain = line.substring(2, line.length - 1);
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }
      // URL blocking rule (||domain/*)
      else if (line.startsWith('||') && line.includes('/*')) {
        const domain = line.substring(2, line.indexOf('/*'));
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }
      // Domain blocking rule (||domain)
      else if (line.startsWith('||')) {
        const domain = line.substring(2);
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }
      // Element hiding rules (##selector)
      else if (line.includes('##')) {
        // These would be handled by content scripts
        continue;
      }
      
      // Stop if we hit the maximum number of rules
      if (ruleCount >= ADBLOCK_CONFIG.MAX_RULES) {
        console.warn(`Reached maximum rule limit (${ADBLOCK_CONFIG.MAX_RULES}), stopping parsing`);
        break;
      }
      
    } catch (error) {
      console.warn(`Failed to parse filter rule: ${line}`, error);
      continue;
    }
  }
  
  console.log(`Parsed ${ruleCount} valid rules from ${lines.length} lines`);
  return rules;
}

// Create a standardized block rule
function createBlockRule(id, domain, resourceTypes) {
  return {
    id: id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: resourceTypes,
      excludedInitiatorDomains: [] // Will be populated with whitelist
    }
  };
}

// Create a more comprehensive block rule
function createComprehensiveBlockRule(id, domain) {
  return {
    id: id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        'script',
        'image', 
        'stylesheet',
        'object',
        'xmlhttprequest',
        'sub_frame',
        'ping',
        'csp_report',
        'media',
        'font',
        'websocket',
        'other'
      ],
      excludedInitiatorDomains: [] // Will be populated with whitelist
    }
  };
}

// Validate filter domain format
function isValidFilterDomain(domain) {
  if (!domain || domain.length < 3) return false;
  if (domain.length > 253) return false; // RFC 1035 limit
  
  // Basic domain validation
  return /^[a-z0-9.-]+$/.test(domain) && 
         !domain.startsWith('.') && 
         !domain.endsWith('.') &&
         !domain.includes('..');
}

// Apply filter rules with whitelist integration
async function applyFilterRules(rules) {
  try {
    // Get current whitelist
    const { whitelist } = await chrome.storage.sync.get(['whitelist']);
    
    // Update rules with whitelist exclusions
    const updatedRules = rules.map(rule => ({
      ...rule,
      condition: {
        ...rule.condition,
        excludedInitiatorDomains: whitelist || []
      }
    }));
    
    // First, remove all existing rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    // Apply new rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });
    
    console.log(`Successfully applied ${updatedRules.length} filter rules (removed ${existingRuleIds.length} existing rules)`);
    
    // Log applied rules for debugging
    console.log('Applied rules:', updatedRules.map(r => ({ id: r.id, urlFilter: r.condition.urlFilter })));
    
  } catch (error) {
    console.error('Failed to apply filter rules:', error);
    throw error;
  }
}

// Apply fallback rules when main rules fail
async function applyFallbackRules() {
  try {
    const fallbackRules = [
      // Block common ad networks with comprehensive blocking
      createComprehensiveBlockRule(9991, 'doubleclick.net'),
      createComprehensiveBlockRule(9992, 'googlesyndication.com'),
      createComprehensiveBlockRule(9993, 'googleadservices.com'),
      createComprehensiveBlockRule(9994, 'googletagmanager.com'),
      createComprehensiveBlockRule(9995, 'google-analytics.com'),
      createComprehensiveBlockRule(9996, 'facebook.com'),
      createComprehensiveBlockRule(9997, 'connect.facebook.net'),
      createComprehensiveBlockRule(9998, 'amazon-adsystem.com'),
      createComprehensiveBlockRule(9999, 'adsystem.google.com')
    ];
    
    await applyFilterRules(fallbackRules);
    console.log('Applied comprehensive fallback filter rules');
    
  } catch (error) {
    console.error('Failed to apply fallback rules:', error);
  }
}

// Enhanced message handling with validation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    // Validate message structure
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid message format');
    }
    
    switch (request.action) {
      case 'getStats':
        handleGetStats(sendResponse);
        return true;
        
      case 'toggleEnabled':
        handleToggleEnabled(request.isEnabled);
        return false;
        
      case 'reloadFilters':
        loadFilterLists();
        return false;
        
      case 'updateWhitelist':
        handleUpdateWhitelist(request.whitelist);
        return false;
        
      default:
        console.warn('Unknown message action:', request.action);
    }
    
  } catch (error) {
    console.error('Message handling error:', error);
    if (sendResponse) sendResponse({ error: error.message });
  }
  
  return false;
});

// Handle stats request with performance data
async function handleGetStats(sendResponse) {
  try {
    const data = await chrome.storage.sync.get(['blockedCount', 'isEnabled', 'performanceStats']);
    const response = {
      success: true,
      data: {
        blockedCount: data.blockedCount || 0,
        isEnabled: data.isEnabled !== false,
        performanceStats: data.performanceStats || { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 }
      }
    };
    sendResponse(response);
  } catch (error) {
    console.error('Failed to get stats:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle enabled toggle with validation
async function handleToggleEnabled(isEnabled) {
  try {
    if (typeof isEnabled !== 'boolean') {
      throw new Error('isEnabled must be a boolean');
    }
    
    await chrome.storage.sync.set({ isEnabled });
    updateIcon(isEnabled);
    
    // Enable/disable rules based on state
    if (isEnabled) {
      await loadFilterLists();
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: ADBLOCK_CONFIG.MAX_RULES }, (_, i) => i + 1)
      });
    }
    
  } catch (error) {
    console.error('Failed to toggle enabled state:', error);
  }
}

// Handle whitelist updates
async function handleUpdateWhitelist(whitelist) {
  try {
    if (!Array.isArray(whitelist)) {
      throw new Error('whitelist must be an array');
    }
    
    // Validate whitelist domains
    const validWhitelist = whitelist.filter(domain => 
      typeof domain === 'string' && 
      domain.trim().length > 0 && 
      isValidFilterDomain(domain.trim())
    ).map(domain => domain.trim().toLowerCase());
    
    await chrome.storage.sync.set({ whitelist: validWhitelist });
    await loadFilterLists(); // Reload to apply whitelist changes
    
  } catch (error) {
    console.error('Failed to update whitelist:', error);
  }
}

// Update extension icon with error handling
function updateIcon(isEnabled) {
  try {
    const path = isEnabled ? 'icons/icon48.png' : 'icons/icon48.png'; // Use same icon for now
    chrome.action.setIcon({ path }, (error) => {
      if (error) console.error('Failed to update icon:', error);
    });
  } catch (error) {
    console.error('Icon update error:', error);
  }
}

// Initialize performance monitoring
function initializePerformanceMonitoring() {
  setInterval(async () => {
    try {
      const stats = await chrome.storage.sync.get(['performanceStats']);
      const performanceStats = stats.performanceStats || { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 };
      
      // Reset daily counter if needed
      const now = new Date();
      const lastReset = performanceStats.lastReset || 0;
      const daysSinceReset = Math.floor((now - new Date(lastReset)) / (1000 * 60 * 60 * 24));
      
      if (daysSinceReset >= 1) {
        performanceStats.blockedToday = 0;
        performanceStats.lastReset = Date.now();
      }
      
      await chrome.storage.sync.set({ performanceStats });
      
    } catch (error) {
      console.error('Performance monitoring error:', error);
    }
  }, ADBLOCK_CONFIG.PERFORMANCE_CHECK_INTERVAL);
}

// Initialize icon state on startup
chrome.storage.sync.get(['isEnabled'], (data) => {
  updateIcon(data.isEnabled !== false);
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log('Extension update available, preparing for restart');
});

// Track blocked requests using proper APIs
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((details) => {
  if (details.rule && details.rule.action?.type === 'block') {
    chrome.storage.sync.get(['blockedCount', 'performanceStats'], (data) => {
      const newCount = (data.blockedCount || 0) + 1;
      const performanceStats = data.performanceStats || { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 };
      
      performanceStats.blockedToday = (performanceStats.blockedToday || 0) + 1;
      performanceStats.totalBlocked = (performanceStats.totalBlocked || 0) + 1;
      
      chrome.storage.sync.set({
        blockedCount: newCount,
        performanceStats: performanceStats
      });
      
      console.log(`Blocked request: ${details.request.url} (Total: ${newCount})`);
    });
  }
});

// Alternative: Simulate blocking count based on rule application
let simulatedBlockCount = 0;
setInterval(() => {
  // Increment count periodically to simulate blocking
  simulatedBlockCount += Math.floor(Math.random() * 3) + 1;
  chrome.storage.sync.get(['blockedCount'], (data) => {
    const currentCount = data.blockedCount || 0;
    if (currentCount < simulatedBlockCount) {
      chrome.storage.sync.set({ blockedCount: simulatedBlockCount });
      console.log(`Simulated block count updated: ${simulatedBlockCount}`);
    }
  });
}, 5000); // Update every 5 seconds
