
const ADBLOCK_CONFIG = {
  MAX_RULES: 30000,
  CACHE_DURATION: 3600000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000,
  PERFORMANCE_CHECK_INTERVAL: 30000
};


const FILTER_LISTS = {
  easylist: {
    name: 'EasyList',
    description: 'Blocks most common ads and advertisements',
    url: 'https://easylist.to/easylist/easylist.txt',
    localUrl: 'filters/easylist.txt',
    version: '1.0',
    lastModified: null,
    ruleCount: 0,
    enabled: true,
    autoUpdate: true,
    updateFrequency: 7
  },
  privacy: {
    name: 'EasyPrivacy',
    description: 'Blocks trackers, analytics, and privacy-invading scripts',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    localUrl: 'filters/privacy.txt',
    version: '2.0',
    lastModified: null,
    ruleCount: 0,
    enabled: false,
    autoUpdate: true,
    updateFrequency: 7
  }
};


const RULE_CACHE = new Map();
const RULE_DEDUPLICATION_CACHE = new Map();


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
    

    // Temporarily disabled to prevent page loading issues
    // await loadFilterLists();
    

    // await applyFallbackRules();
    

    initializePerformanceMonitoring();
    
  } catch (error) {
    console.error('Installation initialization failed:', error);

    await chrome.storage.sync.set({ isEnabled: true, blockedCount: 0 });

    // await applyFallbackRules();
  }
});


async function loadFilterLists(retryCount = 0, force = false) {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    

    const filterLists = settings.filterLists || {
      easyList: true,
      privacyList: false
    };
    
    console.log('Loading filter lists with settings:', filterLists);
    

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


async function loadFilterList(listKey) {
  const filterConfig = FILTER_LISTS[listKey];
  if (!filterConfig) {
    throw new Error(`Unknown filter list: ${listKey}`);
  }

  let filterList = null;
  let source = '';

  try {

    console.log(`Fetching ${filterConfig.name} from remote URL...`);
    const response = await fetch(filterConfig.url, {
      headers: {
        'User-Agent': 'ZenBlock/1.0 (+https://github.com/zenblock)'
      }
    });

    if (response.ok) {
      filterList = await response.text();
      source = `remote (${filterConfig.url})`;
      

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
    

    try {
      const cached = await chrome.storage.local.get([`filterCache_${listKey}`]);
      const cacheData = cached[`filterCache_${listKey}`];
      
      if (cacheData && cacheData.data) {
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxCacheAge = (filterConfig.updateFrequency || 7) * 24 * 60 * 60 * 1000;
        
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


  if (!filterList || filterList.length < 100) {
    throw new Error(`Filter list ${filterConfig.name} appears to be empty or corrupted`);
  }

  const rules = parseFilterList(filterList);
  console.log(`Loaded ${rules.length} rules from ${filterConfig.name} (${source})`);
  

  filterConfig.ruleCount = rules.length;
  filterConfig.lastModified = new Date().toISOString();
  
  return rules;
}


function parseExceptionRule(line, id) {
  try {
    const cleanLine = line.substring(2);
    
    if (cleanLine.startsWith('||') && cleanLine.endsWith('^')) {
      const domain = cleanLine.substring(2, cleanLine.length - 1);
      if (isValidFilterDomain(domain)) {
        return {
          id: id,
          priority: 2,
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


function parseURLPatternRule(line, id) {
  try {

    let urlFilter = line;
    

    if (urlFilter.includes('*')) {

      urlFilter = urlFilter.replace(/\*/g, '*');
    }
    

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


function parseResourceTypeRule(line, id) {
  try {
    const parts = line.split('$');
    if (parts.length !== 2) return null;
    
    const pattern = parts[0];
    const options = parts[1].split(',');
    

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
    

    if (resourceTypes.length === 0) {
      resourceTypes.push('script', 'image', 'stylesheet');
    }
    

    let urlFilter = pattern;
    if (pattern.startsWith('||')) {
      urlFilter = pattern;
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


function parseCSSRule(line) {
  try {

    const isException = line.startsWith('@@');
    const cleanLine = isException ? line.substring(2) : line;
    

    const parts = cleanLine.split('##');
    if (parts.length !== 2) return null;
    
    const [domain, selector] = parts;
    

    if (!selector || selector.length < 1) return null;
    
    return {
      domain: domain || 'global',
      selector: selector.trim(),
      isException: isException
    };
  } catch (error) {
    console.warn('Failed to parse CSS rule:', line, error);
    return null;
  }
}


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

    if (line.startsWith('!') || line.trim() === '') continue;
    

    if (line.length < 3) continue;
    
    try {

      if (line.includes('##')) {
        const cssRule = parseCSSRule(line);
        if (cssRule) {
          if (cssRule.isException) {

            if (!cssRules.exceptions[cssRule.domain]) {
              cssRules.exceptions[cssRule.domain] = [];
            }
            cssRules.exceptions[cssRule.domain].push(cssRule.selector);
          } else {

            if (!cssRules.domains[cssRule.domain]) {
              cssRules.domains[cssRule.domain] = [];
            }
            cssRules.domains[cssRule.domain].push(cssRule.selector);
          }
        }
        continue;
      }
      

      if (line.startsWith('@@')) {
        const exceptionRule = parseExceptionRule(line, id++);
        if (exceptionRule) {
          rules.push(exceptionRule);
          ruleCount++;
        }
        continue;
      }
      

      if (line.startsWith('/') && line.includes('/')) {
        const urlRule = parseURLPatternRule(line, id++);
        if (urlRule) {
          rules.push(urlRule);
          ruleCount++;
        }
        continue;
      }
      

      if (line.includes('$')) {
        const resourceRule = parseResourceTypeRule(line, id++);
        if (resourceRule) {
          rules.push(resourceRule);
          ruleCount++;
        }
        continue;
      }
      

      if (line.startsWith('||') && line.endsWith('^')) {
        const domain = line.substring(2, line.length - 1);
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }

      else if (line.startsWith('||') && line.includes('^')) {
        const domain = line.substring(2, line.indexOf('^'));
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }

      else if (line.startsWith('||')) {
        const domain = line.substring(2);
        if (isValidFilterDomain(domain)) {
          rules.push(createComprehensiveBlockRule(id++, domain));
          ruleCount++;
        }
      }
      

      if (ruleCount >= ADBLOCK_CONFIG.MAX_RULES) {
        console.warn(`Reached maximum rule limit (${ADBLOCK_CONFIG.MAX_RULES}), stopping parsing`);
        break;
      }
      
    } catch (error) {
      console.warn(`Failed to parse filter rule: ${line}`, error);
      continue;
    }
  }
  

  if (Object.keys(cssRules.domains).length > 0 || cssRules.global.length > 0) {
    chrome.storage.local.set({ cssRules: cssRules }).then(() => {
      console.log(`Stored CSS rules for ${Object.keys(cssRules.domains).length} domains`);
      

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.startsWith('http')) {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'updateCSS', 
              cssRules: cssRules 
            }).catch(() => {

            });
          }
        });
      });
    });
  }
  
  console.log(`Parsed ${ruleCount} valid rules from ${lines.length} lines`);
  return rules;
}


function createBlockRule(id, domain, resourceTypes) {
  return {
    id: id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: resourceTypes,
      excludedInitiatorDomains: []
    }
  };
}


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
      excludedInitiatorDomains: []
    }
  };
}


function isValidFilterDomain(domain) {
  if (!domain || domain.length < 3) return false;
  if (domain.length > 253) return false;
  

  return /^[a-z0-9.-]+$/.test(domain) && 
         !domain.startsWith('.') && 
         !domain.endsWith('.') &&
         !domain.includes('..');
}


async function applyFilterRules(rules) {
  try {

    const { whitelist } = await chrome.storage.sync.get(['whitelist']);
    

    const updatedRules = rules.map(rule => ({
      ...rule,
      condition: {
        ...rule.condition,
        excludedInitiatorDomains: whitelist || []
      }
    }));
    

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });
    
    console.log(`Successfully applied ${updatedRules.length} filter rules (removed ${existingRuleIds.length} existing rules)`);
    

    console.log('Applied rules:', updatedRules.map(r => ({ id: r.id, urlFilter: r.condition.urlFilter })));
    
  } catch (error) {
    console.error('Failed to apply filter rules:', error);
    throw error;
  }
}


async function applyFallbackRules() {
  try {
    const fallbackRules = [

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


async function exportSettings() {
  try {

    const settings = await chrome.storage.sync.get([
      'isEnabled', 'filterLists', 'whitelist', 'lastFilterUpdate', 
      'updateFrequency', 'blockedCount', 'performanceStats'
    ]);
    

    const cacheData = await chrome.storage.local.get([
      'filterCache_easylist', 'filterCache_privacy', 'cssRules'
    ]);
    

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


async function importSettings(importData) {
  try {

    if (!importData || typeof importData !== 'object') {
      throw new Error('Invalid import data format');
    }
    
    if (!importData.settings) {
      throw new Error('Import data missing settings');
    }
    

    await chrome.storage.sync.set(importData.settings);
    

    if (importData.cache) {
      await chrome.storage.local.set(importData.cache);
    }
    

    await loadFilterLists(0, true);
    

    const isEnabled = importData.settings.isEnabled !== false;
    updateIcon(isEnabled);
    
    console.log('Settings imported successfully');
    
  } catch (error) {
    console.error('Failed to import settings:', error);
    throw error;
  }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {

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
            sendResponse({ success: true, data: activityLog.slice(0, 20) });
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
            

            const sortedDomains = Object.entries(domainStats)
              .sort(([,a], [,b]) => b.count - a.count)
              .slice(0, 20)
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
  
  return true;
});


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


async function handleToggleEnabled(isEnabled) {
  try {
    if (typeof isEnabled !== 'boolean') {
      throw new Error('isEnabled must be a boolean');
    }
    
    await chrome.storage.sync.set({ isEnabled });
    updateIcon(isEnabled);
    

    if (isEnabled) {
      await loadFilterLists();
      startStatsTracking();
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: ADBLOCK_CONFIG.MAX_RULES }, (_, i) => i + 1)
      });
      stopStatsTracking();
    }
    
  } catch (error) {
    console.error('Failed to toggle enabled state:', error);
  }
}


async function handleUpdateWhitelist(whitelist) {
  try {
    if (!Array.isArray(whitelist)) {
      throw new Error('whitelist must be an array');
    }
    

    const validWhitelist = whitelist.filter(domain => 
      typeof domain === 'string' && 
      domain.trim().length > 0 && 
      isValidFilterDomain(domain.trim())
    ).map(domain => domain.trim().toLowerCase());
    
    await chrome.storage.sync.set({ whitelist: validWhitelist });
    await loadFilterLists();
    
  } catch (error) {
    console.error('Failed to update whitelist:', error);
  }
}


function updateIcon(isEnabled) {
  try {
    const path = isEnabled ? 'icons/icon48.png' : 'icons/icon48.png';
    chrome.action.setIcon({ path }, (error) => {
      if (error) console.error('Failed to update icon:', error);
    });
  } catch (error) {
    console.error('Icon update error:', error);
  }
}


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


async function calculateChecksum(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


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


async function autoUpdateFilterLists() {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    

    const filterLists = settings.filterLists || { easyList: true, privacyList: false };
    const updateFrequency = parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000;
    
    if (!settings.lastFilterUpdate || (now - settings.lastFilterUpdate) > updateFrequency) {
      console.log('Starting automatic filter list update...');
      

      for (const [listId, enabled] of Object.entries(filterLists)) {
        if (enabled) {
          const listInfo = await getFilterListInfo(listId);
          if (listInfo) {
            console.log(`Updated ${listInfo.name}: ${listInfo.ruleCount} rules`);
          }
        }
      }
      

      await loadFilterLists(0, true);
      

      await chrome.storage.sync.set({ lastFilterUpdate: now });
      console.log('Automatic filter list update completed');
    }
  } catch (error) {
    console.error('Auto-update failed:', error);
  }
}


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
    

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch filter list: ${response.status}`);
    }
    
    const content = await response.text();
    const rules = parseFilterList(content);
    customList.ruleCount = rules.length;
    customList.lastModified = new Date().toISOString();
    

    const data = await chrome.storage.sync.get(['customFilterLists']);
    const customLists = data.customFilterLists || {};
    customLists[listId] = customList;
    
    await chrome.storage.sync.set({ customFilterLists: customLists });
    

    await loadFilterLists(0, true);
    
    console.log(`Added custom filter list: ${name} (${rules.length} rules)`);
    return customList;
  } catch (error) {
    console.error('Failed to add custom filter list:', error);
    throw error;
  }
}


async function removeCustomFilterList(listId) {
  try {
    const data = await chrome.storage.sync.get(['customFilterLists']);
    const customLists = data.customFilterLists || {};
    
    if (customLists[listId]) {
      delete customLists[listId];
      await chrome.storage.sync.set({ customFilterLists: customLists });
      

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


async function getAllFilterLists() {
  try {
    const data = await chrome.storage.sync.get(['customFilterLists', 'filterLists']);
    const customLists = data.customFilterLists || {};
    const enabledLists = data.filterLists || {};
    
    const allLists = {};
    

    for (const [listId, config] of Object.entries(FILTER_LISTS)) {
      allLists[listId] = {
        ...config,
        enabled: enabledLists[listId] !== false
      };
    }
    

    for (const [listId, config] of Object.entries(customLists)) {
      allLists[listId] = config;
    }
    
    return allLists;
  } catch (error) {
    console.error('Failed to get all filter lists:', error);
    return {};
  }
}


function initializePerformanceMonitoring() {

  setInterval(autoUpdateFilterLists, 60 * 60 * 1000);
  

  setInterval(() => {
    RULE_CACHE.clear();
    RULE_DEDUPLICATION_CACHE.clear();
    console.log('Cache cleared for performance optimization');
  }, 30 * 60 * 1000);
  

  setInterval(() => {
    updatePerformanceMetrics();
  }, 5000);
}


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
    

    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    stats.rulesActive = rules.length;
    


    

    if (stats.responseTimes && stats.responseTimes.length > 0) {
      stats.avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    }
    

    if (stats.responseTimes && stats.responseTimes.length > 10) {
      stats.responseTimes = stats.responseTimes.slice(-10);
    }
    
    await chrome.storage.sync.set({ performanceStats: stats });
    
  } catch (error) {
    console.error('Failed to update performance metrics:', error);
  }
}


const activityLog = [];
const MAX_ACTIVITY_LOG = 50;

function logActivity(type, domain, details) {
  const activity = {
    type: type,
    domain: domain,
    details: details,
    timestamp: Date.now()
  };
  

  activityLog.unshift(activity);
  

  if (activityLog.length > MAX_ACTIVITY_LOG) {
    activityLog.splice(MAX_ACTIVITY_LOG);
  }
  

  broadcastActivity(activity);
}


async function broadcastActivity(activity) {
  try {

    await chrome.runtime.sendMessage({
      action: 'activityUpdate',
      activity: activity
    }).catch(() => {

    });
  } catch (error) {

  }
}


async function applyFilterRules(rules) {
  const startTime = performance.now();
  
  try {

    const { whitelist } = await chrome.storage.sync.get(['whitelist']);
    

    const deduplicatedRules = deduplicateRules(rules);
    

    const updatedRules = deduplicatedRules.map(rule => ({
      ...rule,
      condition: {
        ...rule.condition,
        excludedInitiatorDomains: whitelist || []
      }
    }));
    

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    console.log('Applying rules:', updatedRules.length, 'removing:', existingRuleIds.length);
    
    // Apply rules in smaller batches to prevent overwhelming
    const BATCH_SIZE = 5000;
    if (updatedRules.length > BATCH_SIZE) {
      console.log('Applying rules in batches due to large rule count');
      for (let i = 0; i < updatedRules.length; i += BATCH_SIZE) {
        const batch = updatedRules.slice(i, i + BATCH_SIZE);
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: i === 0 ? existingRuleIds : [],
          addRules: batch
        });
        console.log(`Applied batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(updatedRules.length/BATCH_SIZE)}`);
      }
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: updatedRules
      });
    }
    
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    

    logPerformance('applyRules', responseTime, updatedRules.length);
    
    console.log(`Successfully applied ${updatedRules.length} filter rules in ${responseTime.toFixed(2)}ms`);
    

    logActivity('rulesApplied', 'extension', `Applied ${updatedRules.length} rules`);
    

    console.log('Applied rules:', updatedRules.map(r => ({ id: r.id, urlFilter: r.condition.urlFilter })));
    
  } catch (error) {
    console.error('Failed to apply filter rules:', error);
    logActivity('error', 'extension', `Failed to apply rules: ${error.message}`);
    throw error;
  }
}


function logPerformance(operation, responseTime, details = 0) {
  chrome.storage.sync.get(['performanceStats'], (data) => {
    const stats = data.performanceStats || { 
      blockedToday: 0, 
      totalBlocked: 0, 
      avgResponseTime: 0,
      responseTimes: []
    };
    

    if (!stats.responseTimes) stats.responseTimes = [];
    stats.responseTimes.push(responseTime);
    

    if (stats.responseTimes.length > 20) {
      stats.responseTimes = stats.responseTimes.slice(-20);
    }
    

    stats.avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    
    chrome.storage.sync.set({ performanceStats: stats });
  });
}


let statsTrackingInterval;
let lastProcessedRules = new Set();
let lastTrackingCall = 0;
let trackingErrorCount = 0;
const TRACKING_COOLDOWN = 30000; // 30 seconds between calls
const MAX_TRACKING_ERRORS = 5;

async function trackBlockedRequests() {
  try {
    // Rate limiting to avoid quota exceeded errors
    const now = Date.now();
    if (now - lastTrackingCall < TRACKING_COOLDOWN) {
      return;
    }
    lastTrackingCall = now;

    const matchedRules = await chrome.declarativeNetRequest.getMatchedRules();
    const currentRuleIds = new Set(matchedRules.rulesMatchedInfo.filter(rule => rule && rule.ruleId).map(rule => rule.ruleId));
    

    const newRules = matchedRules.rulesMatchedInfo.filter(rule => 
      rule && rule.ruleId && !lastProcessedRules.has(rule.ruleId) && 
      rule.action && rule.action.type === 'block'
    );
    
    if (newRules.length > 0) {

      const result = await chrome.storage.sync.get(['blockedCount', 'performanceStats', 'domainStats']);
      const newCount = (result.blockedCount || 0) + newRules.length;
      const performanceStats = result.performanceStats || { 
        blockedToday: 0, 
        totalBlocked: 0, 
        avgResponseTime: 0 
      };
      const domainStats = result.domainStats || {};
      

      performanceStats.blockedToday = (performanceStats.blockedToday || 0) + newRules.length;
      performanceStats.totalBlocked = (performanceStats.totalBlocked || 0) + newRules.length;
      

      newRules.forEach(rule => {
        try {
          if (!rule.request || !rule.request.url) {
            return;
          }
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
          

          let blockType = 'blocked';
          if (rule.condition && rule.condition.urlFilter && (
              rule.condition.urlFilter.includes('analytics') || 
              rule.condition.urlFilter.includes('ga.js') ||
              rule.condition.urlFilter.includes('gtm'))) {
            blockType = 'analytics';
          } else if (rule.condition && rule.condition.urlFilter && (
                     rule.condition.urlFilter.includes('tr') ||
                     rule.condition.urlFilter.includes('track') ||
                     rule.condition.urlFilter.includes('pixel'))) {
            blockType = 'tracker';
          } else if (rule.condition && rule.condition.urlFilter && (
                     rule.condition.urlFilter.includes('ad') ||
                     rule.condition.urlFilter.includes('doubleclick') ||
                     rule.condition.urlFilter.includes('googlesyndication'))) {
            blockType = 'ad';
          }
          
          logActivity(blockType, domain, `Blocked ${rule.request?.type || 'unknown'} request`);
          console.log(`Blocked ${blockType} request: ${rule.request.url} (Total: ${newCount})`);
        } catch (e) {
          console.warn('Failed to parse domain from blocked request:', e);
        }
      });
      

      await chrome.storage.sync.set({
        blockedCount: newCount,
        performanceStats: performanceStats,
        domainStats: domainStats
      });
      

      lastProcessedRules = currentRuleIds;
    
    // Reset error counter on successful tracking
    trackingErrorCount = 0;
    }
  } catch (error) {
    trackingErrorCount++;
    
    // Handle quota exceeded errors gracefully
    if (error.message.includes('MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL')) {
      console.warn('Rate limit reached, skipping this tracking cycle');
      // Increase cooldown time if we hit the limit
      lastTrackingCall = Date.now() + 60000; // Add 60 seconds penalty
    } else {
      console.error('Error tracking blocked requests:', error);
    }
    
    // Disable tracking if too many errors occur
    if (trackingErrorCount >= MAX_TRACKING_ERRORS) {
      console.warn('Too many tracking errors, disabling stats tracking temporarily');
      stopStatsTracking();
      // Retry after 5 minutes
      setTimeout(() => {
        trackingErrorCount = 0;
        startStatsTracking();
      }, 300000);
    }
  }
}


function startStatsTracking() {
  // Temporarily disabled tracking to prevent page loading issues
  console.log('Stats tracking disabled temporarily');
  return;
}


function stopStatsTracking() {
  if (statsTrackingInterval) {
    clearInterval(statsTrackingInterval);
    statsTrackingInterval = null;
  }
  lastProcessedRules.clear();
}


chrome.storage.sync.get(['isEnabled'], (data) => {
  updateIcon(data.isEnabled !== false);
  

  if (data.isEnabled !== false) {
    startStatsTracking();
  }
});


chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log('Extension update available, preparing for restart');
});

