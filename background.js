
const ADBLOCK_CONFIG = {
  MAX_RULES: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 5000,
  STATS_TRACKING_INTERVAL: 60000,
  ALARM_STATS: 'zenblock-stats-tracking',
  ALARM_PERF: 'zenblock-performance-metrics',
  ALARM_AUTO_UPDATE: 'zenblock-auto-update'
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

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    
    const syncDefaults = {
      isEnabled: true,
      whitelist: [],
      filterLists: { easyList: true, privacyList: true },
      updateFrequency: '7',
      lastFilterUpdate: 0
    };
    const localDefaults = {
      blockedCount: 0,
      performanceStats: { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 },
      domainStats: {},
      totalSites: 0
    };

    const syncResult = await chrome.storage.sync.get(Object.keys(syncDefaults));
    const syncUpdates = {};
    
    for (const [key, value] of Object.entries(syncDefaults)) {
      if (syncResult[key] === undefined) {
        syncUpdates[key] = value;
      }
    }
    
    if (Object.keys(syncUpdates).length > 0) {
      await chrome.storage.sync.set(syncUpdates);
    }

    const localResult = await chrome.storage.local.get(Object.keys(localDefaults));
    const localUpdates = {};

    for (const [key, value] of Object.entries(localDefaults)) {
      if (localResult[key] === undefined) {
        localUpdates[key] = value;
      }
    }

    if (Object.keys(localUpdates).length > 0) {
      await chrome.storage.local.set(localUpdates);
    }
    

    await loadFilterLists(0, true);

    initializePerformanceMonitoring();

  } catch (error) {

    await chrome.storage.sync.set({ isEnabled: true });
    await chrome.storage.local.set({ blockedCount: 0 });
    await applyFallbackRules();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const [{ isEnabled }, existingRules] = await Promise.all([
      chrome.storage.sync.get(['isEnabled']),
      chrome.declarativeNetRequest.getDynamicRules()
    ]);
    if (isEnabled !== false && existingRules.length === 0) {
      await loadFilterLists(0, true);
    }
  } catch (error) {}
});

async function loadFilterLists(retryCount = 0, force = false) {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    

    const filterLists = settings.filterLists || {
      easyList: true,
      privacyList: false
    };
    
    

    const shouldUpdate = force || !settings.lastFilterUpdate || 
                        (now - settings.lastFilterUpdate) > (parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000);
    
    if (shouldUpdate || retryCount > 0) {
      
      const activeLists = [];
      if (filterLists.easyList !== false) activeLists.push('easylist');
      if (filterLists.privacyList !== false) activeLists.push('privacy');
      const quota = activeLists.length > 0
        ? Math.floor(ADBLOCK_CONFIG.MAX_RULES / activeLists.length)
        : ADBLOCK_CONFIG.MAX_RULES;
      const filterPromises = [];
      
      if (filterLists.easyList !== false) {
        filterPromises.push(loadFilterList('easylist', quota));
      }

      if (filterLists.privacyList !== false) {
        filterPromises.push(loadFilterList('privacy', quota));
      }
      
      const results = await Promise.allSettled(filterPromises);
      const successfulFilters = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      
      if (successfulFilters.length > 0) {
        const allRules = successfulFilters.flat();
        await applyFilterRules(allRules);
        await chrome.storage.sync.set({ lastFilterUpdate: now });
      } else {
        throw new Error('No filter lists loaded successfully');
      }
    }

  } catch (error) {
    
    if (retryCount < ADBLOCK_CONFIG.RETRY_ATTEMPTS) {
      setTimeout(() => loadFilterLists(retryCount + 1, force), ADBLOCK_CONFIG.RETRY_DELAY);
    } else {
      await applyFallbackRules();
    }
  }
}

async function loadFilterList(listKey, quota) {
  const filterConfig = FILTER_LISTS[listKey];
  if (!filterConfig) {
    throw new Error(`Unknown filter list: ${listKey}`);
  }

  let filterList = null;
  let source = '';

  try {

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
      } catch (cacheError) {}
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (remoteError) {
    

    try {
      const cached = await chrome.storage.local.get([`filterCache_${listKey}`]);
      const cacheData = cached[`filterCache_${listKey}`];
      
      if (cacheData && cacheData.data) {
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxCacheAge = (filterConfig.updateFrequency || 7) * 24 * 60 * 60 * 1000;
        
        if (cacheAge < maxCacheAge) {
          filterList = cacheData.data;
          source = `cache (${Math.round(cacheAge / (60 * 60 * 1000))}h old)`;
        } else {
        }
      }
    } catch (cacheError) {}
    

    if (!filterList && filterConfig.localUrl) {
      try {
        const localResponse = await fetch(chrome.runtime.getURL(filterConfig.localUrl));
        if (localResponse.ok) {
          filterList = await localResponse.text();
          source = `local file (${filterConfig.localUrl})`;
        }
      } catch (localError) {}
    }
  }

  if (!filterList) {
    throw new Error(`Failed to load ${filterConfig.name} from any source`);
  }

  if (!filterList || filterList.length < 100) {
    throw new Error(`Filter list ${filterConfig.name} appears to be empty or corrupted`);
  }

  const rules = parseFilterList(filterList, quota || ADBLOCK_CONFIG.MAX_RULES);
  

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
  } catch (error) {}
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
  } catch (error) {}
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
  } catch (error) {}
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
    return null;
  }
}

function parseFilterList(filterList, quota = ADBLOCK_CONFIG.MAX_RULES) {
  const cssRules = {
    global: [],
    domains: {},
    exceptions: {}
  };
  const lines = filterList.split('\n');
  let id = 1;

  // Rules are bucketed so the most valuable ones are installed first:
  // exception rules, then domain-anchored rules (||domain^), then generic
  // pattern rules fill any remaining capacity up to MAX_RULES.
  const exceptionRules = [];
  const domainEntries = [];
  const domainParents = new Set();
  const genericRules = [];

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
          exceptionRules.push(exceptionRule);
        }
        continue;
      }
      

      if (line.startsWith('||')) {
        if (line.includes('$')) {
          const resourceRule = parseResourceTypeRule(line, id++);
          if (resourceRule) {
            const d = line.slice(2).split('^')[0].split('/')[0].toLowerCase();
            if (isValidFilterDomain(d)) {
              domainEntries.push({ domain: d, rule: resourceRule });
            }
          }
        } else if (line.endsWith('^')) {
          const domain = line.substring(2, line.length - 1);
          if (isValidFilterDomain(domain)) {
            domainParents.add(domain);
            domainEntries.push({ domain: domain, rule: createComprehensiveBlockRule(id++, domain) });
          }
        } else if (line.includes('^')) {
          const domain = line.substring(2, line.indexOf('^'));
          if (isValidFilterDomain(domain)) {
            domainParents.add(domain);
            domainEntries.push({ domain: domain, rule: createComprehensiveBlockRule(id++, domain) });
          }
        } else {
          const domain = line.substring(2);
          if (isValidFilterDomain(domain)) {
            domainParents.add(domain);
            domainEntries.push({ domain: domain, rule: createComprehensiveBlockRule(id++, domain) });
          }
        }
        continue;
      }
      

      if (line.startsWith('/')) {
        const regexRule = parseRegexRule(line, id++);
        if (regexRule) {
          genericRules.push(regexRule);
        } else if (line.includes('/')) {
          const urlRule = parseURLPatternRule(line, id++);
          if (urlRule) {
            genericRules.push(urlRule);
          }
        }
        continue;
      }
      

      if (line.includes('$')) {
        const resourceRule = parseResourceTypeRule(line, id++);
        if (resourceRule) {
          genericRules.push(resourceRule);
        }
        continue;
      }
      

      const plainRule = createPatternBlockRule(id++, line);
      if (plainRule) {
        genericRules.push(plainRule);
      }
      

    } catch (error) {
      continue;
    }
  }
  

  if (Object.keys(cssRules.domains).length > 0 || cssRules.global.length > 0) {
    try { chrome.storage.local.set({ cssRules: cssRules }).catch(() => {}); } catch (e) {}
  }
  
  // Subdomain rules are redundant when a parent-domain rule exists,
  // so they are dropped to compress the ruleset under the DNR cap.
  const keptDomainRules = domainEntries
    .filter(e => {
      for (let i = e.domain.indexOf('.'); i >= 0; i = e.domain.indexOf('.', i + 1)) {
        if (domainParents.has(e.domain.slice(i + 1))) return false;
      }
      return true;
    })
    .map(e => e.rule);

  const allowedDomainCount = Math.max(0, quota - exceptionRules.length);
  const rules = exceptionRules.concat(keptDomainRules.slice(0, allowedDomainCount));
  const remaining = quota - rules.length;
  if (remaining > 0 && genericRules.length > 0) {
    rules.push(...genericRules.slice(0, remaining));
  }
  
  return rules;
}

function createPatternBlockRule(id, urlFilter) {
  try {
    if (typeof urlFilter !== 'string') return null;
    urlFilter = urlFilter.trim();
    if (urlFilter.length < 3 || urlFilter.length > 500) return null;
    return {
      id: id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: [
          'script', 'image', 'stylesheet', 'object', 'xmlhttprequest',
          'sub_frame', 'ping', 'csp_report', 'media', 'font', 'websocket', 'other'
        ]
      }
    };
  } catch (error) {}
  return null;
}

function parseRegexRule(line, id) {
  try {
    let body = line;
    let options = '';
    const dollar = line.indexOf('$');
    if (dollar >= 0) {
      body = line.slice(0, dollar);
      options = line.slice(dollar + 1);
    }
    if (!body.startsWith('/') || !body.endsWith('/') || body.length < 3) return null;
    const pattern = body.slice(1, -1);
    if (pattern.length < 3 || pattern.length > 1000) return null;
    new RegExp(pattern);
    const condition = {
      regexFilter: pattern,
      resourceTypes: [
        'script', 'image', 'stylesheet', 'object', 'xmlhttprequest',
        'sub_frame', 'ping', 'csp_report', 'media', 'font', 'websocket', 'other'
      ]
    };
    if (options.includes('third-party') && !options.includes('~third-party')) {
      condition.domainType = 'thirdParty';
    }
    return {
      id: id,
      priority: options.includes('important') ? 3 : 1,
      action: { type: 'block' },
      condition: condition
    };
  } catch (error) {}
  return null;
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
    
  } catch (error) {}
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
          
        default:
      }
      
    } catch (error) {
      if (sendResponse) sendResponse({ error: error.message });
    }
    
    return false;
  })();
  
  return true;
});

async function handleGetStats(sendResponse) {
  try {
    const syncData = await chrome.storage.sync.get(['isEnabled']);
    const localData = await chrome.storage.local.get(['blockedCount', 'performanceStats', 'domainStats']);
    const data = Object.assign({}, syncData, localData);
    const response = {
      success: true,
      data: {
        blockedCount: data.blockedCount || 0,
        isEnabled: data.isEnabled !== false,
        performanceStats: data.performanceStats || { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 },
        totalSites: Object.keys(data.domainStats || {}).length
      }
    };
    sendResponse(response);
  } catch (error) {
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
      await loadFilterLists(0, true);
      startStatsTracking();
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: ADBLOCK_CONFIG.MAX_RULES }, (_, i) => i + 1)
      });
      stopStatsTracking();
    }
    
  } catch (error) {}
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
    await loadFilterLists(0, true);
    
  } catch (error) {}
}

function updateIcon(isEnabled) {
  try {
    const path = isEnabled ? 'icons/icon48.png' : 'icons/icon48.png';
    chrome.action.setIcon({ path }, () => {
      if (chrome.runtime.lastError) {}
    });
  } catch (error) {}
}

function deduplicateRules(rules) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const rule of rules) {
    const key = `${rule.condition.urlFilter || rule.condition.regexFilter || ''}|${rule.action.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(rule);
    }
  }
  
  return deduplicated;
}

async function autoUpdateFilterLists() {
  try {
    const settings = await chrome.storage.sync.get(['filterLists', 'lastFilterUpdate', 'updateFrequency']);
    const now = Date.now();
    

    const filterLists = settings.filterLists || { easyList: true, privacyList: false };
    const updateFrequency = parseInt(settings.updateFrequency || '7') * 24 * 60 * 60 * 1000;
    
    if (!settings.lastFilterUpdate || (now - settings.lastFilterUpdate) > updateFrequency) {
await loadFilterLists(0, true);
      

      await chrome.storage.sync.set({ lastFilterUpdate: now });
    }
  } catch (error) {}
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
    const rules = parseFilterList(content, 5000);
    customList.ruleCount = rules.length;
    customList.lastModified = new Date().toISOString();
    

    const data = await chrome.storage.sync.get(['customFilterLists']);
    const customLists = data.customFilterLists || {};
    customLists[listId] = customList;
    
    await chrome.storage.sync.set({ customFilterLists: customLists });
    

    await loadFilterLists(0, true);
    
    return customList;
  } catch (error) {
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
      
      return true;
    }
    
    return false;
  } catch (error) {
    throw error;
  }
}

function initializePerformanceMonitoring() {

  chrome.alarms.create(ADBLOCK_CONFIG.ALARM_AUTO_UPDATE, { periodInMinutes: 60 });
  chrome.alarms.create(ADBLOCK_CONFIG.ALARM_PERF, { periodInMinutes: 5 });
  chrome.alarms.create(ADBLOCK_CONFIG.ALARM_STATS, { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ADBLOCK_CONFIG.ALARM_AUTO_UPDATE) {
      autoUpdateFilterLists();
    } else if (alarm.name === ADBLOCK_CONFIG.ALARM_PERF) {
      updatePerformanceMetrics();
    } else if (alarm.name === ADBLOCK_CONFIG.ALARM_STATS) {
      trackBlockedRequests();
    }
  });
}
  

async function updatePerformanceMetrics() {
  try {
    const performanceStats = await chrome.storage.local.get(['performanceStats']);
    const stats = performanceStats.performanceStats || { 
      blockedToday: 0, 
      totalBlocked: 0, 
      avgResponseTime: 0,
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
    
    await chrome.storage.local.set({ performanceStats: stats });
    
  } catch (error) {}
}

function logActivity(type, domain, details) {
  const activity = {
    type: type,
    domain: domain,
    details: details,
    timestamp: Date.now()
  };
  

  

  

  broadcastActivity(activity);
}

async function broadcastActivity(activity) {
  try {

    await chrome.runtime.sendMessage({
      action: 'activityUpdate',
      activity: activity
    }).catch(() => {

    });
  } catch (error) {}
}

async function applyFilterRules(rules) {
  const startTime = performance.now();
  
  try {

    const { whitelist } = await chrome.storage.sync.get(['whitelist']);
    

    const deduplicatedRules = deduplicateRules(rules);

    // Assign sequential IDs so rules from multiple filter lists
    // (each parsed with IDs starting at 1) can never collide.
    const mergedRules = deduplicatedRules
      .slice(0, ADBLOCK_CONFIG.MAX_RULES)
      .map((rule, index) => ({ ...rule, id: index + 1 }));

    const updatedRules = mergedRules.map(rule => ({
      ...rule,
      condition: {
        ...rule.condition,
        excludedInitiatorDomains: whitelist || []
      }
    }));
    

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    
    // Apply rules in smaller batches to prevent overwhelming
    const BATCH_SIZE = 5000;
    if (updatedRules.length > BATCH_SIZE) {
      for (let i = 0; i < updatedRules.length; i += BATCH_SIZE) {
        const batch = updatedRules.slice(i, i + BATCH_SIZE);
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: i === 0 ? existingRuleIds : [],
          addRules: batch
        });
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
    
    

    logActivity('rulesApplied', 'extension', `Applied ${updatedRules.length} rules`);
    

    
  } catch (error) {
    logActivity('error', 'extension', `Failed to apply rules: ${error.message}`);
    throw error;
  }
}

function logPerformance(operation, responseTime, details = 0) {
  chrome.storage.local.get(['performanceStats'], (data) => {
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
    
    chrome.storage.local.set({ performanceStats: stats });
  });
}

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

      const result = await chrome.storage.local.get(['blockedCount', 'performanceStats', 'domainStats', 'totalSites']);
      const newCount = (result.blockedCount || 0) + newRules.length;
      const performanceStats = result.performanceStats || { 
        blockedToday: 0, 
        totalBlocked: 0, 
        avgResponseTime: 0 
      };
      const domainStats = result.domainStats || {};
      const knownSites = new Set(Object.keys(domainStats));
      

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
          const reqUrl = (rule.request && rule.request.url) || '';
          const filterText = (rule.condition && rule.condition.urlFilter) || '';
          const classifyText = (reqUrl + ' ' + filterText).toLowerCase();
          if (/analytics|doubleclick\.net|googlesyndication|adservice|adsystem|adnxs|criteo|taboola|outbrain|advert|adserver|\/ads?\b/.test(classifyText)) {
            blockType = 'ad';
          } else if (/track|pixel|telemetry|beacon|scorecardresearch|segment\.io|amplitude|mixpanel/.test(classifyText)) {
            blockType = 'tracker';
          }

          if (blockType === 'ad') {
            domainStats[domain].ads = (domainStats[domain].ads || 0) + 1;
          } else if (blockType === 'tracker') {
            domainStats[domain].trackers = (domainStats[domain].trackers || 0) + 1;
          }

          logActivity(blockType, domain, `Blocked ${rule.request?.type || 'unknown'} request`);
        } catch (e) {}
      });
      

      await chrome.storage.local.set({
        blockedCount: newCount,
        performanceStats: performanceStats,
        domainStats: domainStats,
        totalSites: Object.keys(domainStats).length
      });
      

      lastProcessedRules = currentRuleIds;

      // Reset error counter on successful tracking
      trackingErrorCount = 0;
    }
  } catch (error) {
    trackingErrorCount++;

    // Handle quota exceeded errors gracefully
    if (error.message.includes('MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL')) {
      // Increase cooldown time if we hit the limit
      lastTrackingCall = Date.now() + 60000;
    }

    if (trackingErrorCount >= MAX_TRACKING_ERRORS) {
      stopStatsTracking();
      setTimeout(() => {
        trackingErrorCount = 0;
        startStatsTracking();
      }, 300000);
    }
  }
}

function startStatsTracking() {
  lastTrackingCall = 0;
  trackBlockedRequests();
}

function stopStatsTracking() {
  lastProcessedRules.clear();
}

chrome.storage.sync.get(['isEnabled'], (data) => {
  updateIcon(data.isEnabled !== false);
  

  if (data.isEnabled !== false) {
    startStatsTracking();
  }
});

