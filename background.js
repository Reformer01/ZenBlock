// Enhanced ad-blocking extension with robust error handling and performance optimization
const ADBLOCK_CONFIG = {
  MAX_RULES: 30000,
  CACHE_DURATION: 3600000, // 1 hour
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000,
  PERFORMANCE_CHECK_INTERVAL: 30000 // 30 seconds
};

// Enhanced filter list configuration
const FILTER_LISTS = {
  easylist: {
    name: 'EasyList',
    description: 'Blocks most common ads and advertisements',
    url: 'https://easylist.to/easylist/easylist.txt',
    localUrl: 'filters/easylist.txt', // Fallback to local file
    version: '1.0',
    lastModified: null,
    ruleCount: 0,
    enabled: true,
    autoUpdate: true,
    updateFrequency: 7 // days
  },
  privacy: {
    name: 'EasyPrivacy',
    description: 'Blocks trackers, analytics, and privacy-invading scripts',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    localUrl: 'filters/privacy.txt', // Fallback to local file
    version: '2.0',
    lastModified: null,
    ruleCount: 0,
    enabled: false,
    autoUpdate: true,
    updateFrequency: 7 // days
  }
};

// Performance optimization cache
const RULE_CACHE = new Map();
const RULE_DEDUPLICATION_CACHE = new Map();

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
async function loadFilterLists(retryCount = 0, force = false) {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    
    // Ensure filterLists has default values
    const filterLists = settings.filterLists || {
      easyList: true,
      privacyList: false
    };
    
    console.log('Loading filter lists with settings:', filterLists);
    
    // Check if we need to update filter lists (or force reload)
    const shouldUpdate = force || !settings.lastFilterUpdate || 
                        (now - settings.lastFilterUpdate) > (parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000);
    
    if (shouldUpdate || retryCount > 0) {
      console.log(`Loading filter lists (attempt ${retryCount + 1}, force: ${force})`);
      
      const filterPromises = [];
      
      if (filterLists.easyList !== false) {
        console.log('Loading EasyList...');
        filterPromises.push(loadFilterList('easylist'));
      } else {
        console.log('EasyList is disabled');
      }
      
      if (filterLists.privacyList === true) {
        console.log('Loading Privacy List...');
        filterPromises.push(loadFilterList('privacy'));
      } else {
        console.log('Privacy List is disabled');
      }
      
      const results = await Promise.allSettled(filterPromises);
      const successfulFilters = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      if (successfulFilters.length > 0) {
        const allRules = successfulFilters.flat();
        await applyFilterRules(allRules);
        await chrome.storage.sync.set({ lastFilterUpdate: now });
        console.log(`Successfully loaded ${allRules.length} filter rules from ${successfulFilters.length} filter lists`);
      } else {
        throw new Error('No filter lists loaded successfully');
      }
    } else {
      console.log('Filter lists recently updated, skipping reload');
    }
    
  } catch (error) {
    console.error(`Filter list loading failed (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < ADBLOCK_CONFIG.RETRY_ATTEMPTS) {
      setTimeout(() => loadFilterLists(retryCount + 1, force), ADBLOCK_CONFIG.RETRY_DELAY);
    } else {
      console.error('All filter list loading attempts failed, using fallback rules');
      await applyFallbackRules();
    }
  }
}

// Load individual filter list with remote fetching and fallback
async function loadFilterList(listKey) {
  const filterConfig = FILTER_LISTS[listKey];
  if (!filterConfig) {
    throw new Error(`Unknown filter list: ${listKey}`);
  }

  let filterList = null;
  let source = '';

  try {
    // Try remote URL first
    console.log(`Fetching ${filterConfig.name} from remote URL...`);
    const response = await fetch(filterConfig.url, {
      headers: {
        'User-Agent': 'ZenBlock/1.0 (+https://github.com/zenblock)'
      }
    });

    if (response.ok) {
      filterList = await response.text();
      source = `remote (${filterConfig.url})`;
      
      // Cache the downloaded list locally
      try {
        await chrome.storage.local.set({
          [`filterCache_${listKey}`]: {
            data: filterList,
            timestamp: Date.now(),
            lastModified: response.headers.get('Last-Modified'),
            etag: response.headers.get('ETag')
          }
        });
        console.log(`Cached ${filterConfig.name} locally`);
      } catch (cacheError) {
        console.warn('Failed to cache filter list:', cacheError);
      }
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (remoteError) {
    console.warn(`Failed to fetch ${filterConfig.name} from remote URL:`, remoteError);
    
    // Try to load from cache
    try {
      const cached = await chrome.storage.local.get([`filterCache_${listKey}`]);
      const cacheData = cached[`filterCache_${listKey}`];
      
      if (cacheData && cacheData.data) {
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxCacheAge = (filterConfig.updateFrequency || 7) * 24 * 60 * 60 * 1000; // days to ms
        
        if (cacheAge < maxCacheAge) {
          filterList = cacheData.data;
          source = `cache (${Math.round(cacheAge / (60 * 60 * 1000))}h old)`;
          console.log(`Using cached ${filterConfig.name}`);
        } else {
          console.log(`Cached ${filterConfig.name} is too old (${Math.round(cacheAge / (24 * 60 * 60 * 1000))} days)`);
        }
      }
    } catch (cacheError) {
      console.warn('Failed to load from cache:', cacheError);
    }
    
    // Fallback to local file if still no data
    if (!filterList && filterConfig.localUrl) {
      try {
        console.log(`Falling back to local file for ${filterConfig.name}...`);
        const localResponse = await fetch(chrome.runtime.getURL(filterConfig.localUrl));
        if (localResponse.ok) {
          filterList = await localResponse.text();
          source = `local file (${filterConfig.localUrl})`;
          console.log(`Using local ${filterConfig.name}`);
        }
      } catch (localError) {
        console.warn(`Failed to load local ${filterConfig.name}:`, localError);
      }
    }
  }

  if (!filterList) {
    throw new Error(`Failed to load ${filterConfig.name} from any source`);
  }

  // Validate filter list content
  if (!filterList || filterList.length < 100) {
    throw new Error(`Filter list ${filterConfig.name} appears to be empty or corrupted`);
  }

  const rules = parseFilterList(filterList);
  console.log(`Loaded ${rules.length} rules from ${filterConfig.name} (${source})`);
  
  // Update filter list metadata
  filterConfig.ruleCount = rules.length;
  filterConfig.lastModified = new Date().toISOString();
  
  return rules;
}

// Parse exception rules (@@||domain^)
function parseExceptionRule(line, id) {
  try {
    const cleanLine = line.substring(2); // Remove @@
    
    if (cleanLine.startsWith('||') && cleanLine.endsWith('^')) {
      const domain = cleanLine.substring(2, cleanLine.length - 1);
      if (isValidFilterDomain(domain)) {
        return {
          id: id,
          priority: 2, // Higher priority for exceptions
          action: { type: 'allow' },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: [
              'script', 'image', 'stylesheet', 'object', 'xmlhttprequest',
              'sub_frame', 'ping', 'csp_report', 'media', 'font', 'websocket', 'other'
            ]
          }
        };
      }
    }
  } catch (error) {
    console.warn('Failed to parse exception rule:', line, error);
  }
  return null;
}

// Parse URL pattern rules (/ads/*, *ad*.js)
function parseURLPatternRule(line, id) {
  try {
    // Convert Adblock Plus pattern to declarativeNetRequest format
    let urlFilter = line;
    
    // Handle wildcards
    if (urlFilter.includes('*')) {
      // Convert * to wildcard patterns
      urlFilter = urlFilter.replace(/\*/g, '*');
    }
    
    // Ensure proper format
    if (!urlFilter.startsWith('||') && !urlFilter.startsWith('|')) {
      urlFilter = `*${urlFilter}*`;
    }
    
    return {
      id: id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: ['script', 'image', 'stylesheet', 'object', 'xmlhttprequest']
      }
    };
  } catch (error) {
    console.warn('Failed to parse URL pattern rule:', line, error);
  }
  return null;
}

// Parse resource type filters ($script, $image, etc.)
function parseResourceTypeRule(line, id) {
  try {
    const parts = line.split('$');
    if (parts.length !== 2) return null;
    
    const pattern = parts[0];
    const options = parts[1].split(',');
    
    // Map Adblock Plus options to declarativeNetRequest resource types
    const resourceTypeMap = {
      'script': 'script',
      'image': 'image',
      'stylesheet': 'stylesheet',
      'object': 'object',
      'xmlhttprequest': 'xmlhttprequest',
      'sub_frame': 'sub_frame',
      'ping': 'ping',
      'csp_report': 'csp_report',
      'media': 'media',
      'font': 'font',
      'websocket': 'websocket',
      'other': 'other'
    };
    
    const resourceTypes = [];
    let isImportant = false;
    let isThirdParty = false;
    
    for (const option of options) {
      const cleanOption = option.trim();
      
      if (cleanOption === 'important') {
        isImportant = true;
      } else if (cleanOption === 'third-party') {
        isThirdParty = true;
      } else if (resourceTypeMap[cleanOption]) {
        resourceTypes.push(resourceTypeMap[cleanOption]);
      }
    }
    
    // Default to common resource types if none specified
    if (resourceTypes.length === 0) {
      resourceTypes.push('script', 'image', 'stylesheet');
    }
    
    // Convert pattern to URL filter
    let urlFilter = pattern;
    if (pattern.startsWith('||')) {
      urlFilter = pattern; // Keep domain pattern
    } else if (!urlFilter.includes('*')) {
      urlFilter = `*${urlFilter}*`;
    }
    
    return {
      id: id,
      priority: isImportant ? 3 : 1,
      action: { type: 'block' },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: resourceTypes,
        domainType: isThirdParty ? 'thirdParty' : undefined
      }
    };
  } catch (error) {
    console.warn('Failed to parse resource type rule:', line, error);
  }
  return null;
}

// Parse CSS element hiding rules
function parseCSSRule(line) {
  try {
    // Exception rule (@@example.com##.selector)
    const isException = line.startsWith('@@');
    const cleanLine = isException ? line.substring(2) : line;
    
    // Split domain and selector
    const parts = cleanLine.split('##');
    if (parts.length !== 2) return null;
    
    const [domain, selector] = parts;
    
    // Validate selector
    if (!selector || selector.length < 1) return null;
    
    return {
      domain: domain || 'global', // Global rule if no domain specified
      selector: selector.trim(),
      isException: isException
    };
  } catch (error) {
    console.warn('Failed to parse CSS rule:', line, error);
    return null;
  }
}

// Enhanced filter list parser with comprehensive rule support
function parseFilterList(filterList) {
  const rules = [];
  const cssRules = {
    global: [],
    domains: {},
    exceptions: {}
  };
  const lines = filterList.split('\n');
  let id = 1;
  let ruleCount = 0;
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('!') || line.trim() === '') continue;
    
    // Skip malformed lines
    if (line.length < 3) continue;
    
    try {
      // Element hiding rules (##selector)
      if (line.includes('##')) {
        const cssRule = parseCSSRule(line);
        if (cssRule) {
          if (cssRule.isException) {
            // Exception rule (@@example.com##.selector)
            if (!cssRules.exceptions[cssRule.domain]) {
              cssRules.exceptions[cssRule.domain] = [];
            }
            cssRules.exceptions[cssRule.domain].push(cssRule.selector);
          } else {
            // Regular element hiding rule
            if (!cssRules.domains[cssRule.domain]) {
              cssRules.domains[cssRule.domain] = [];
            }
            cssRules.domains[cssRule.domain].push(cssRule.selector);
          }
        }
        continue;
      }
      
      // Exception rules (@@||domain^)
      if (line.startsWith('@@')) {
        const exceptionRule = parseExceptionRule(line, id++);
        if (exceptionRule) {
          rules.push(exceptionRule);
          ruleCount++;
        }
        continue;
      }
      
      // URL pattern matching (/ads/*, *ad*.js)
      if (line.startsWith('/') && line.includes('/*')) {
        const urlRule = parseURLPatternRule(line, id++);
        if (urlRule) {
          rules.push(urlRule);
          ruleCount++;
        }
        continue;
      }
      
      // Resource type filters ($script, $image, etc.)
      if (line.includes('$')) {
        const resourceRule = parseResourceTypeRule(line, id++);
        if (resourceRule) {
          rules.push(resourceRule);
          ruleCount++;
        }
        continue;
      }
      
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
  
  // Store CSS rules separately for content script use
  if (Object.keys(cssRules.domains).length > 0 || cssRules.global.length > 0) {
    chrome.storage.local.set({ cssRules: cssRules }).then(() => {
      console.log(`Stored CSS rules for ${Object.keys(cssRules.domains).length} domains`);
      
      // Notify content scripts about updated CSS rules
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.startsWith('http')) {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'updateCSS', 
              cssRules: cssRules 
            }).catch(() => {
              // Ignore errors for tabs that don't have content script
            });
          }
        });
      });
    });
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

// Export all settings for backup
async function exportSettings() {
  try {
    // Get all settings from storage
    const settings = await chrome.storage.sync.get([
      'isEnabled', 'filterLists', 'whitelist', 'lastFilterUpdate', 
      'updateFrequency', 'blockedCount', 'performanceStats'
    ]);
    
    // Get filter cache from local storage
    const cacheData = await chrome.storage.local.get([
      'filterCache_easylist', 'filterCache_privacy', 'cssRules'
    ]);
    
    // Create export object with metadata
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: settings,
      cache: cacheData,
      metadata: {
        extension: 'ZenBlock',
        exportType: 'full_backup'
      }
    };
    
    console.log('Settings exported successfully');
    return exportData;
    
  } catch (error) {
    console.error('Failed to export settings:', error);
    throw error;
  }
}

// Import settings from backup
async function importSettings(importData) {
  try {
    // Validate import data structure
    if (!importData || typeof importData !== 'object') {
      throw new Error('Invalid import data format');
    }
    
    if (!importData.settings) {
      throw new Error('Import data missing settings');
    }
    
    // Import settings to sync storage
    await chrome.storage.sync.set(importData.settings);
    
    // Import cache data to local storage if available
    if (importData.cache) {
      await chrome.storage.local.set(importData.cache);
    }
    
    // Reload filters with new settings
    await loadFilterLists(0, true);
    
    // Update icon state
    const isEnabled = importData.settings.isEnabled !== false;
    updateIcon(isEnabled);
    
    console.log('Settings imported successfully');
    
  } catch (error) {
    console.error('Failed to import settings:', error);
    throw error;
  }
}

// Enhanced message handling with validation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
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
          await handleToggleEnabled(request.isEnabled);
          return false;
          
        case 'reloadFilters':
          // Force reload filters regardless of update frequency
          await loadFilterLists(0, true);
          return false;
          
        case 'updateWhitelist':
          await handleUpdateWhitelist(request.whitelist);
          return false;
          
        case 'getFilterLists':
          const allLists = await getAllFilterLists();
          sendResponse({ success: true, data: allLists });
          return true;
          
        case 'addCustomFilterList':
          try {
            const customList = await addCustomFilterList(request.name, request.url, request.description);
            sendResponse({ success: true, data: customList });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'removeCustomFilterList':
          try {
            const removed = await removeCustomFilterList(request.listId);
            sendResponse({ success: true, data: { removed } });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'getFilterListInfo':
          try {
            const listInfo = await getFilterListInfo(request.listId);
            sendResponse({ success: true, data: listInfo });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'autoUpdateFilterLists':
          try {
            await autoUpdateFilterLists();
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'getActivityLog':
          try {
            sendResponse({ success: true, data: activityLog.slice(0, 20) }); // Return last 20 activities
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'getPerformanceMetrics':
          try {
            const stats = await chrome.storage.sync.get(['performanceStats']);
            sendResponse({ success: true, data: stats.performanceStats || {} });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'exportSettings':
          try {
            const exportData = await exportSettings();
            sendResponse({ success: true, data: exportData });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'importSettings':
          try {
            await importSettings(request.settings);
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        case 'getDomainStats':
          try {
            const result = await chrome.storage.sync.get(['domainStats']);
            const domainStats = result.domainStats || {};
            
            // Sort domains by block count (descending)
            const sortedDomains = Object.entries(domainStats)
              .sort(([,a], [,b]) => b.count - a.count)
              .slice(0, 20) // Top 20 domains
              .map(([domain, stats]) => ({
                domain,
                count: stats.count,
                lastBlocked: stats.lastBlocked,
                firstSeen: stats.firstSeen
              }));
            
            sendResponse({ success: true, data: sortedDomains });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;
          
        default:
          console.warn('Unknown message action:', request.action);
      }
      
    } catch (error) {
      console.error('Message handling error:', error);
      if (sendResponse) sendResponse({ error: error.message });
    }
    
    return false;
  })();
  
  return true; // Keep message channel open for async response
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
      startStatsTracking(); // Start tracking when enabled
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: ADBLOCK_CONFIG.MAX_RULES }, (_, i) => i + 1)
      });
      stopStatsTracking(); // Stop tracking when disabled
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

// Advanced filter list management
async function getFilterListInfo(listId) {
  const list = FILTER_LISTS[listId];
  if (!list) return null;
  
  try {
    const response = await fetch(chrome.runtime.getURL(list.url));
    const content = await response.text();
    const rules = parseFilterList(content);
    
    return {
      ...list,
      ruleCount: rules.length,
      lastModified: new Date().toISOString(),
      checksum: await calculateChecksum(content)
    };
  } catch (error) {
    console.error(`Failed to get filter list info for ${listId}:`, error);
    return null;
  }
}

// Calculate checksum for filter list integrity
async function calculateChecksum(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Rule deduplication and optimization
function deduplicateRules(rules) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const rule of rules) {
    const key = `${rule.condition.urlFilter}|${rule.action.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(rule);
    }
  }
  
  console.log(`Deduplicated ${rules.length} rules to ${deduplicated.length} rules`);
  return deduplicated;
}

// Auto-update mechanism for filter lists
async function autoUpdateFilterLists() {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    
    // Check if any filter lists need updating
    const filterLists = settings.filterLists || { easyList: true, privacyList: false };
    const updateFrequency = parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000;
    
    if (!settings.lastFilterUpdate || (now - settings.lastFilterUpdate) > updateFrequency) {
      console.log('Starting automatic filter list update...');
      
      // Update each enabled filter list
      for (const [listId, enabled] of Object.entries(filterLists)) {
        if (enabled) {
          const listInfo = await getFilterListInfo(listId);
          if (listInfo) {
            console.log(`Updated ${listInfo.name}: ${listInfo.ruleCount} rules`);
          }
        }
      }
      
      // Force reload filters with new data
      await loadFilterLists(0, true);
      
      // Update timestamp
      await chrome.storage.sync.set({ lastFilterUpdate: now });
      console.log('Automatic filter list update completed');
    }
  } catch (error) {
    console.error('Auto-update failed:', error);
  }
}

// Add custom filter list
async function addCustomFilterList(name, url, description = '') {
  try {
    const listId = `custom_${Date.now()}`;
    const customList = {
      id: listId,
      name: name,
      description: description,
      url: url,
      version: '1.0',
      lastModified: null,
      ruleCount: 0,
      enabled: true,
      autoUpdate: true,
      updateFrequency: 7,
      custom: true
    };
    
    // Validate the filter list
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch filter list: ${response.status}`);
    }
    
    const content = await response.text();
    const rules = parseFilterList(content);
    customList.ruleCount = rules.length;
    customList.lastModified = new Date().toISOString();
    
    // Save to storage
    const data = await chrome.storage.sync.get(['customFilterLists']);
    const customLists = data.customFilterLists || {};
    customLists[listId] = customList;
    
    await chrome.storage.sync.set({ customFilterLists: customLists });
    
    // Reload filters to include the new list
    await loadFilterLists(0, true);
    
    console.log(`Added custom filter list: ${name} (${rules.length} rules)`);
    return customList;
  } catch (error) {
    console.error('Failed to add custom filter list:', error);
    throw error;
  }
}

// Remove custom filter list
async function removeCustomFilterList(listId) {
  try {
    const data = await chrome.storage.sync.get(['customFilterLists']);
    const customLists = data.customFilterLists || {};
    
    if (customLists[listId]) {
      delete customLists[listId];
      await chrome.storage.sync.set({ customFilterLists: customLists });
      
      // Reload filters to remove the list
      await loadFilterLists(0, true);
      
      console.log(`Removed custom filter list: ${listId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to remove custom filter list:', error);
    throw error;
  }
}

// Get all filter lists (built-in + custom)
async function getAllFilterLists() {
  try {
    const data = await chrome.storage.sync.get(['customFilterLists', 'filterLists']);
    const customLists = data.customFilterLists || {};
    const enabledLists = data.filterLists || {};
    
    const allLists = {};
    
    // Add built-in lists
    for (const [listId, config] of Object.entries(FILTER_LISTS)) {
      allLists[listId] = {
        ...config,
        enabled: enabledLists[listId] !== false
      };
    }
    
    // Add custom lists
    for (const [listId, config] of Object.entries(customLists)) {
      allLists[listId] = config;
    }
    
    return allLists;
  } catch (error) {
    console.error('Failed to get all filter lists:', error);
    return {};
  }
}

// Enhanced performance monitoring
function initializePerformanceMonitoring() {
  // Auto-update filter lists periodically
  setInterval(autoUpdateFilterLists, 60 * 60 * 1000); // Check every hour
  
  // Clean up old cache entries
  setInterval(() => {
    RULE_CACHE.clear();
    RULE_DEDUPLICATION_CACHE.clear();
    console.log('Cache cleared for performance optimization');
  }, 30 * 60 * 1000); // Clear every 30 minutes
  
  // Performance metrics tracking
  setInterval(() => {
    updatePerformanceMetrics();
  }, 5000); // Update every 5 seconds
}

// Update performance metrics
async function updatePerformanceMetrics() {
  try {
    const performanceStats = await chrome.storage.sync.get(['performanceStats']);
    const stats = performanceStats.performanceStats || { 
      blockedToday: 0, 
      totalBlocked: 0, 
      avgResponseTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      rulesActive: 0
    };
    
    // Get current rule count
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    stats.rulesActive = rules.length;
    
    // CPU and memory usage removed - these were simulated/fake metrics
    // Real performance monitoring not available in Manifest V3 without additional permissions
    
    // Update average response time
    if (stats.responseTimes && stats.responseTimes.length > 0) {
      stats.avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    }
    
    // Keep only last 10 response times
    if (stats.responseTimes && stats.responseTimes.length > 10) {
      stats.responseTimes = stats.responseTimes.slice(-10);
    }
    
    await chrome.storage.sync.set({ performanceStats: stats });
    
  } catch (error) {
    console.error('Failed to update performance metrics:', error);
  }
}

// Real-time activity tracking
const activityLog = [];
const MAX_ACTIVITY_LOG = 50;

function logActivity(type, domain, details) {
  const activity = {
    type: type,
    domain: domain,
    details: details,
    timestamp: Date.now()
  };
  
  // Add to beginning of array
  activityLog.unshift(activity);
  
  // Keep only last MAX_ACTIVITY_LOG entries
  if (activityLog.length > MAX_ACTIVITY_LOG) {
    activityLog.splice(MAX_ACTIVITY_LOG);
  }
  
  // Broadcast to popup if open
  broadcastActivity(activity);
}

// Broadcast activity to popup
async function broadcastActivity(activity) {
  try {
    // Try to send to popup (may fail if popup is closed)
    await chrome.runtime.sendMessage({
      action: 'activityUpdate',
      activity: activity
    }).catch(() => {
      // Popup is not open, ignore error
    });
  } catch (error) {
    // Ignore broadcast errors
  }
}

// Enhanced rule application with activity logging
async function applyFilterRules(rules) {
  const startTime = performance.now();
  
  try {
    // Get current whitelist
    const { whitelist } = await chrome.storage.sync.get(['whitelist']);
    
    // Apply deduplication
    const deduplicatedRules = deduplicateRules(rules);
    
    // Update rules with whitelist exclusions
    const updatedRules = deduplicatedRules.map(rule => ({
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
    
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    // Log performance
    logPerformance('applyRules', responseTime, updatedRules.length);
    
    console.log(`Successfully applied ${updatedRules.length} filter rules in ${responseTime.toFixed(2)}ms`);
    
    // Log activity
    logActivity('rulesApplied', 'extension', `Applied ${updatedRules.length} rules`);
    
    // Log applied rules for debugging
    console.log('Applied rules:', updatedRules.map(r => ({ id: r.id, urlFilter: r.condition.urlFilter })));
    
  } catch (error) {
    console.error('Failed to apply filter rules:', error);
    logActivity('error', 'extension', `Failed to apply rules: ${error.message}`);
    throw error;
  }
}

// Log performance metrics
function logPerformance(operation, responseTime, details = 0) {
  chrome.storage.sync.get(['performanceStats'], (data) => {
    const stats = data.performanceStats || { 
      blockedToday: 0, 
      totalBlocked: 0, 
      avgResponseTime: 0,
      responseTimes: []
    };
    
    // Add response time
    if (!stats.responseTimes) stats.responseTimes = [];
    stats.responseTimes.push(responseTime);
    
    // Keep only last 20 response times
    if (stats.responseTimes.length > 20) {
      stats.responseTimes = stats.responseTimes.slice(-20);
    }
    
    // Calculate average
    stats.avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    
    chrome.storage.sync.set({ performanceStats: stats });
  });
}

// Real-time statistics tracking using getMatchedRules API
let statsTrackingInterval;
let lastProcessedRules = new Set();

async function trackBlockedRequests() {
  try {
    const matchedRules = await chrome.declarativeNetRequest.getMatchedRules();
    const currentRuleIds = new Set(matchedRules.rulesMatchedInfo.map(rule => rule.ruleId));
    
    // Find newly matched rules (not processed before)
    const newRules = matchedRules.rulesMatchedInfo.filter(rule => 
      !lastProcessedRules.has(rule.ruleId) && rule.action.type === 'block'
    );
    
    if (newRules.length > 0) {
      // Update statistics for new blocked requests
      const result = await chrome.storage.sync.get(['blockedCount', 'performanceStats', 'domainStats']);
      const newCount = (result.blockedCount || 0) + newRules.length;
      const performanceStats = result.performanceStats || { 
        blockedToday: 0, 
        totalBlocked: 0, 
        avgResponseTime: 0 
      };
      const domainStats = result.domainStats || {};
      
      // Update performance stats
      performanceStats.blockedToday = (performanceStats.blockedToday || 0) + newRules.length;
      performanceStats.totalBlocked = (performanceStats.totalBlocked || 0) + newRules.length;
      
      // Track per-domain statistics
      newRules.forEach(rule => {
        try {
          const domain = new URL(rule.request.url).hostname;
          if (!domainStats[domain]) {
            domainStats[domain] = {
              count: 0,
              lastBlocked: Date.now(),
              firstSeen: Date.now()
            };
          }
          domainStats[domain].count += 1;
          domainStats[domain].lastBlocked = Date.now();
          
          // Determine block type for logging
          let blockType = 'blocked';
          if (rule.condition.urlFilter?.includes('analytics') || 
              rule.condition.urlFilter?.includes('ga.js') ||
              rule.condition.urlFilter?.includes('gtm')) {
            blockType = 'analytics';
          } else if (rule.condition.urlFilter?.includes('tr') ||
                     rule.condition.urlFilter?.includes('track') ||
                     rule.condition.urlFilter?.includes('pixel')) {
            blockType = 'tracker';
          } else if (rule.condition.urlFilter?.includes('ad') ||
                     rule.condition.urlFilter?.includes('doubleclick') ||
                     rule.condition.urlFilter?.includes('googlesyndication')) {
            blockType = 'ad';
          }
          
          logActivity(blockType, domain, `Blocked ${rule.request.type} request`);
          console.log(`Blocked ${blockType} request: ${rule.request.url} (Total: ${newCount})`);
        } catch (e) {
          console.warn('Failed to parse domain from blocked request:', e);
        }
      });
      
      // Save updated statistics
      await chrome.storage.sync.set({
        blockedCount: newCount,
        performanceStats: performanceStats,
        domainStats: domainStats
      });
      
      // Update processed rules set
      lastProcessedRules = currentRuleIds;
    }
  } catch (error) {
    console.error('Error tracking blocked requests:', error);
  }
}

// Start statistics tracking
function startStatsTracking() {
  // Track immediately on start
  trackBlockedRequests();
  
  // Then poll every 2 seconds for real-time updates
  statsTrackingInterval = setInterval(trackBlockedRequests, 2000);
}

// Stop statistics tracking
function stopStatsTracking() {
  if (statsTrackingInterval) {
    clearInterval(statsTrackingInterval);
    statsTrackingInterval = null;
  }
  lastProcessedRules.clear();
}

// Initialize icon state and start tracking on startup
chrome.storage.sync.get(['isEnabled'], (data) => {
  updateIcon(data.isEnabled !== false);
  
  // Start statistics tracking if extension is enabled
  if (data.isEnabled !== false) {
    startStatsTracking();
  }
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log('Extension update available, preparing for restart');
});

