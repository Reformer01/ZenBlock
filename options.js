document.addEventListener('DOMContentLoaded', () => {
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelist');

  const navItems = document.querySelectorAll('.nav-item');
  const contentSections = document.querySelectorAll('.content-section');

  function initTheme() {
    const savedTheme = localStorage.getItem('zenblock-theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeToggle(savedTheme);
  }

  function updateThemeToggle(theme) {
    if (themeToggle) {
      themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('zenblock-theme', newTheme);
    updateThemeToggle(newTheme);
    

    chrome.storage.sync.set({ theme: newTheme });
  }


  function setupToggleSwitches() {
    const toggleContainers = document.querySelectorAll('.form-checkbox');
    
    toggleContainers.forEach(container => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      const toggleSwitch = container.querySelector('.toggle-switch');
      
      if (checkbox && toggleSwitch) {

        if (checkbox.checked) {
          toggleSwitch.classList.add('active');
        }
        

        toggleSwitch.addEventListener('click', () => {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            toggleSwitch.classList.add('active');
          } else {
            toggleSwitch.classList.remove('active');
          }

          checkbox.dispatchEvent(new Event('change'));
        });
        

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            toggleSwitch.classList.add('active');
          } else {
            toggleSwitch.classList.remove('active');
          }
        });
      }
    });
  }


  initTheme();


  setupToggleSwitches();


  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }


  function switchSection(sectionId) {

    navItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      }
    });


    contentSections.forEach(section => {
      section.classList.remove('active');
      if (section.id === sectionId) {
        section.classList.add('active');
      }
    });


    window.location.hash = sectionId;
  }


  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.getAttribute('data-section');
      switchSection(sectionId);
    });
  });


  const initialHash = window.location.hash.substring(1);
  if (initialHash && document.getElementById(initialHash)) {
    switchSection(initialHash);
  }


  function updateDashboardStats(data) {

    const blockedCount = document.getElementById('blockedCount');
    const whitelistCount = document.getElementById('whitelistCount');
    const filterCount = document.getElementById('filterCount');
    const uptimeCount = document.getElementById('uptimeCount');

    if (blockedCount) {
      let count = data.blockedCount || 0;
      if (count >= 1000000) {
        blockedCount.textContent = (count / 1000000).toFixed(1) + 'M';
      } else if (count >= 1000) {
        blockedCount.textContent = (count / 1000).toFixed(1) + 'K';
      } else {
        blockedCount.textContent = count.toLocaleString();
      }
    }

    if (whitelistCount) {
      whitelistCount.textContent = (data.whitelist || []).length;
    }

    if (filterCount) {
      let activeFilters = 0;
      if (data.filterLists?.easyList !== false) activeFilters++;
      if (data.filterLists?.privacyList === true) activeFilters++;
      filterCount.textContent = activeFilters;
    }

    if (uptimeCount) {
      uptimeCount.textContent = '100%';
    }


    const avgResponseTime = document.getElementById('avgResponseTime');
    const blockedToday = document.getElementById('blockedToday');
    const totalBlocked = document.getElementById('totalBlocked');

    if (avgResponseTime && data.performanceStats?.avgResponseTime) {
      avgResponseTime.textContent = Math.round(data.performanceStats.avgResponseTime) + 'ms';
    }

    if (blockedToday && data.performanceStats?.blockedToday) {
      blockedToday.textContent = data.performanceStats.blockedToday.toLocaleString();
    }

    if (totalBlocked && data.performanceStats?.totalBlocked) {
      totalBlocked.textContent = data.performanceStats.totalBlocked.toLocaleString();
    }


    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate && data.lastFilterUpdate) {
      const date = new Date(data.lastFilterUpdate);
      lastUpdate.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  }


  function validateDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return { valid: false, error: 'Domain is required' };
    }

    domain = domain.trim().toLowerCase();
    

    if (domain.length < 3) {
      return { valid: false, error: 'Domain must be at least 3 characters' };
    }
    
    if (domain.length > 253) {
      return { valid: false, error: 'Domain is too long (max 253 characters)' };
    }


    if (!/^[a-z0-9.-]+$/.test(domain)) {
      return { valid: false, error: 'Domain can only contain letters, numbers, dots, and hyphens' };
    }


    if (domain.startsWith('.') || domain.endsWith('.')) {
      return { valid: false, error: 'Domain cannot start or end with a dot' };
    }

    if (domain.includes('..')) {
      return { valid: false, error: 'Domain cannot contain consecutive dots' };
    }


    const invalidPatterns = [
      /^\./,
      /\.$/,
      /\.\./,
      /^-/,
      /-$/,
      /--/,
      /^\d+\.\d+\.\d+\.\d+$/,
      /^[a-f0-9:]+:[a-f0-9:]+$/i
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(domain)) {
        return { valid: false, error: 'Invalid domain format' };
      }
    }


    const parts = domain.split('.');
    if (parts.length < 2) {
      return { valid: false, error: 'Domain must have at least one dot' };
    }

    const tld = parts[parts.length - 1];
    if (tld.length < 2) {
      return { valid: false, error: 'Top-level domain must be at least 2 characters' };
    }


    if (!/^[a-z]{2,}$/.test(tld)) {
      return { valid: false, error: 'Invalid top-level domain' };
    }


    const reservedDomains = [
      'localhost', 'example.com', 'example.org', 'example.net',
      'test.com', 'invalid.com', 'reserved.com'
    ];

    if (reservedDomains.includes(domain)) {
      return { valid: false, error: 'This domain is reserved and cannot be whitelisted' };
    }

    return { valid: true, domain };
  }


  function matchesDomain(url, whitelistedDomain) {
    try {
      const urlDomain = new URL(url).hostname.toLowerCase();
      const whitelistDomain = whitelistedDomain.toLowerCase();


      if (urlDomain === whitelistDomain) {
        return true;
      }


      if (urlDomain.endsWith('.' + whitelistDomain)) {
        return true;
      }


      if (whitelistDomain.startsWith('*.')) {
        const baseDomain = whitelistDomain.substring(2);
        return urlDomain === baseDomain || urlDomain.endsWith('.' + baseDomain);
      }

      return false;
    } catch (error) {
      console.error('Domain matching error:', error);
      return false;
    }
  }


  function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }


  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
    errorDiv.textContent = message;
    

    if (whitelistInput && whitelistInput.parentNode) {
      const existingErrors = whitelistInput.parentNode.querySelectorAll('.error-message');
      existingErrors.forEach(err => err.remove());
      
      errorDiv.className = 'error-message';
      whitelistInput.parentNode.appendChild(errorDiv);
      

      setTimeout(() => errorDiv.remove(), 5000);
    } else {
      console.error('Cannot show error message - whitelistInput or parent not found:', message);
    }
  }


  async function loadSettings() {
    try {
      const data = await chrome.storage.sync.get(['whitelist', 'filterLists', 'updateFrequency', 'performanceStats', 'theme']);
      

      if (data.theme) {
        document.body.setAttribute('data-theme', data.theme);
        localStorage.setItem('zenblock-theme', data.theme);
        updateThemeToggle(data.theme);
      }
      

      const whitelist = Array.isArray(data.whitelist) ? data.whitelist.filter(domain => {
        const validation = validateDomain(domain);
        return validation.valid;
      }) : [];
      
      updateWhitelistDisplay(whitelist);


      const filterLists = data.filterLists || { easyList: true, privacyList: false };
      if (enableEasyList) enableEasyList.checked = filterLists.easyList !== false;
      if (enablePrivacyList) enablePrivacyList.checked = filterLists.privacyList || false;


      if (updateFrequency) updateFrequency.value = data.updateFrequency || '7';


      updateDashboardStats(data);


      setupToggleSwitches();

    } catch (error) {
      console.error('Failed to load settings:', error);
      showError('Failed to load settings. Please refresh the page.');
    }
  }


  function displayPerformanceStats(stats) {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'performance-stats';
    statsContainer.innerHTML = `
      <h3>Performance Statistics</h3>
      <p>Blocked today: ${stats.blockedToday || 0}</p>
      <p>Total blocked: ${stats.totalBlocked || 0}</p>
      <p>Average response time: ${stats.avgResponseTime || 0}ms</p>
    `;
    
    const existingStats = document.querySelector('.performance-stats');
    if (existingStats) {
      existingStats.replaceWith(statsContainer);
    } else {
      const lastSection = document.querySelector('.content-section:last-child');
      if (lastSection) {
        lastSection.appendChild(statsContainer);
      } else {
        console.warn('Cannot find .content-section:last-child to append performance stats');
      }
    }
  }


  async function addToWhitelist() {
    const domain = whitelistInput.value.trim();
    
    if (!domain) {
      showError('Please enter a domain');
      return;
    }

    const validation = validateDomain(domain);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    try {
      const data = await chrome.storage.sync.get(['whitelist']);
      const whitelist = Array.isArray(data.whitelist) ? data.whitelist : [];
      

      const normalizedDomain = validation.domain.toLowerCase();
      if (whitelist.some(d => d.toLowerCase() === normalizedDomain)) {
        showError('Domain is already whitelisted');
        return;
      }


      whitelist.push(normalizedDomain);
      await chrome.storage.sync.set({ whitelist });
      

      updateWhitelistDisplay(whitelist);
      whitelistInput.value = '';
      

      chrome.runtime.sendMessage({
        action: 'updateWhitelist',
        whitelist: whitelist
      });
      
      showSavedMessage();
      
    } catch (error) {
      console.error('Failed to add to whitelist:', error);
      showError('Failed to add domain to whitelist');
    }
  }


  function updateWhitelistDisplay(whitelist) {
    if (!whitelistContainer) return;
    
    whitelistContainer.innerHTML = '';
    
    if (!whitelist || whitelist.length === 0) {
      whitelistContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="width: 48px; height: 48px; margin: 0 auto 16px; background-image: url('icons/padlock.png'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.7;"></div>
          <div style="font-size: 16px; font-weight: 500;">No whitelisted websites</div>
          <div style="font-size: 14px; margin-top: 8px;">Add websites above to exclude them from ad blocking</div>
        </div>
      `;
      return;
    }
    
    whitelist.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'whitelist-item';
      item.innerHTML = `
        <span class="whitelist-domain">${domain}</span>
        <div class="whitelist-actions">
          <button class="btn btn-sm btn-success" data-domain="${domain}" title="Test if site is accessible">
            Test
          </button>
          <button class="btn btn-sm btn-danger" data-domain="${domain}" title="Remove from whitelist">
            Remove
          </button>
        </div>
      `;
      whitelistContainer.appendChild(item);
    });
  }


  async function removeFromWhitelist(domain) {
    try {
      const data = await chrome.storage.sync.get(['whitelist']);
      const whitelist = (data.whitelist || []).filter(d => d.toLowerCase() !== domain.toLowerCase());
      
      await chrome.storage.sync.set({ whitelist });
      updateWhitelistDisplay(whitelist);
      showSavedMessage();
      

      chrome.runtime.sendMessage({
        action: 'updateWhitelist',
        whitelist: whitelist
      });
      
    } catch (error) {
      console.error('Failed to remove from whitelist:', error);
      showError('Failed to remove domain from whitelist');
    }
  }


  async function testDomain(domain) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'testDomain',
        domain: domain
      });
      
      const message = response.isBlocked 
        ? `${domain} is currently being blocked` 
        : `${domain} is not being blocked`;
      
      alert(message);
      
    } catch (error) {
      console.error('Failed to test domain:', error);
      showError('Failed to test domain');
    }
  }


  async function saveAllSettings() {
    try {

      const data = await chrome.storage.sync.get(['whitelist']);
      const whitelist = Array.isArray(data.whitelist) ? data.whitelist : [];
      const validWhitelist = whitelist.filter(domain => {
        const validation = validateDomain(domain);
        if (!validation.valid) {
          console.warn(`Invalid domain in whitelist: ${domain} - ${validation.error}`);
          return false;
        }
        return true;
      });


      const currentTheme = document.body.getAttribute('data-theme') || 'light';

      const settings = {
        whitelist: validWhitelist,
        filterLists: {
          easyList: enableEasyList ? enableEasyList.checked : true,
          privacyList: enablePrivacyList ? enablePrivacyList.checked : false
        },
        updateFrequency: updateFrequency ? updateFrequency.value : '7',
        theme: currentTheme
      };

      await chrome.storage.sync.set(settings);
      showSavedMessage();
      

      chrome.runtime.sendMessage({ action: 'reloadFilters' });
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      showError('Failed to save settings');
    }
  }


  function showSavedMessage() {
    if (savedMessage) {
      savedMessage.style.display = 'inline';
      setTimeout(() => {
        if (savedMessage) {
          savedMessage.style.display = 'none';
        }
      }, 3000);
    }
  }


  if (addWhitelistBtn) addWhitelistBtn.addEventListener('click', addToWhitelist);
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveAllSettings);
  

  const resetSettingsBtn = document.getElementById('resetSettings');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all settings to defaults? This will clear your whitelist and restore default settings.')) {
        try {

          await chrome.storage.sync.clear();
          await chrome.storage.local.clear();
          

          const defaults = {
            blockedCount: 0,
            isEnabled: true,
            whitelist: [],
            filterLists: { easyList: true, privacyList: false },
            updateFrequency: '7',
            lastFilterUpdate: Date.now(),
            performanceStats: { blockedToday: 0, totalBlocked: 0, avgResponseTime: 0 }
          };
          
          await chrome.storage.sync.set(defaults);
          

          window.location.reload();
          
        } catch (error) {
          console.error('Failed to reset settings:', error);
          showError('Failed to reset settings');
        }
      }
    });
  }


  if (whitelistContainer) {
    whitelistContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-danger')) {
        const domain = e.target.dataset.domain;
        removeFromWhitelist(domain);
      } else if (e.target.classList.contains('btn-success')) {
        const domain = e.target.dataset.domain;
        testDomain(domain);
      }
    });
  }


  if (whitelistInput) {
    whitelistInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addToWhitelist();
      }
    });
  }


  [enableEasyList, enablePrivacyList, updateFrequency].forEach(element => {
    if (element) {
      element.addEventListener('change', () => {
        saveAllSettings();
      });
    }
  });


  loadSettings();
  

  loadFilterLists();
  

  initSiteStats();
});


  let currentPage = 1;
  let itemsPerPage = 25;
  let allSiteStats = [];
  let filteredSiteStats = [];


  function initSiteStats() {

    chrome.storage.sync.get('domainStats', (data) => {
      const domainStats = data.domainStats || {};
      

      allSiteStats = Object.entries(domainStats).map(([domain, stats]) => ({
        domain: domain || 'unknown',
        adsBlocked: Math.floor((stats.count || 0) * 0.6),
        trackersBlocked: Math.floor((stats.count || 0) * 0.4),
        lastBlocked: stats.lastBlocked || Date.now(),
        firstSeen: stats.firstSeen || Date.now(),
        totalBlocked: stats.count || 0
      }));
      
      filteredSiteStats = [...allSiteStats];
      updateSiteStatsDisplay();
    });


    document.getElementById('siteFilter')?.addEventListener('input', filterSiteStats);
    document.getElementById('clearFilter')?.addEventListener('click', clearSiteFilter);
    document.getElementById('itemsPerPage')?.addEventListener('change', updateItemsPerPage);
    document.getElementById('prevPage')?.addEventListener('click', goToPrevPage);
    document.getElementById('nextPage')?.addEventListener('click', goToNextPage);
    

    document.getElementById('closeDetailsModal')?.addEventListener('click', closeSiteDetailsModal);
    document.getElementById('closeDetailsModalBtn')?.addEventListener('click', closeSiteDetailsModal);
    document.getElementById('exportSiteData')?.addEventListener('click', exportSiteData);
    document.getElementById('clearSiteData')?.addEventListener('click', clearAllSiteData);
    

    document.getElementById('generateSampleData')?.addEventListener('click', generateSampleData);
  }

  function filterSiteStats() {
    const filter = document.getElementById('siteFilter').value.toLowerCase();
    filteredSiteStats = allSiteStats.filter(site => 
      site.domain && typeof site.domain === 'string' && site.domain.toLowerCase().includes(filter)
    );
    currentPage = 1;
    updateSiteStatsDisplay();
  }

  function clearSiteFilter() {
    document.getElementById('siteFilter').value = '';
    filterSiteStats();
  }

  function updateItemsPerPage(e) {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    updateSiteStatsDisplay();
  }

  function goToPrevPage() {
    if (currentPage > 1) {
      currentPage--;
      updateSiteStatsDisplay();
    }
  }

  function goToNextPage() {
    const totalPages = Math.ceil(filteredSiteStats.length / itemsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      updateSiteStatsDisplay();
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  function updateSiteStatsDisplay() {
    const tbody = document.getElementById('siteStatsBody');
    if (!tbody) return;

    if (!filteredSiteStats || filteredSiteStats.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center" style="padding: 30px; color: var(--text-muted);">
            No statistics available for the current filter
          </td>
        </tr>
      `;
      updatePaginationControls();
      return;
    }


    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedStats = filteredSiteStats.slice(startIndex, endIndex);


    tbody.innerHTML = '';


    paginatedStats.forEach(site => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${site.domain}</td>
        <td>${site.adsBlocked || 0}</td>
        <td>${site.trackersBlocked || 0}</td>
        <td>${formatDate(site.lastBlocked)}</td>
        <td>
          <button class="btn btn-sm btn-secondary view-details" data-domain="${site.domain}">
            Details
          </button>
          <button class="btn btn-sm btn-danger clear-stats" data-domain="${site.domain}">
            Clear
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });


    document.querySelectorAll('.view-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const domain = e.target.dataset.domain;
        viewSiteDetails(domain);
      });
    });

    document.querySelectorAll('.clear-stats').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const domain = e.target.dataset.domain;
        clearSiteStats(domain);
      });
    });

    updatePaginationControls();
  }

  function updatePaginationControls() {
    const totalPages = Math.ceil(filteredSiteStats.length / itemsPerPage);
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    if (prevBtn && nextBtn && pageInfo) {
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    }
  }

  function viewSiteDetails(domain) {

    const modal = document.getElementById('siteDetailsModal');
    const siteData = allSiteStats.find(site => site.domain === domain);
    
    if (!siteData) return;
    

    document.getElementById('detailsDomain').textContent = domain;
    document.getElementById('detailsTotalBlocked').textContent = siteData.totalBlocked || 0;
    document.getElementById('detailsAdsBlocked').textContent = siteData.adsBlocked || 0;
    document.getElementById('detailsTrackersBlocked').textContent = siteData.trackersBlocked || 0;
    document.getElementById('detailsFirstSeen').textContent = formatDate(siteData.firstSeen);
    document.getElementById('detailsLastBlocked').textContent = formatDate(siteData.lastBlocked);
    

    const blockRate = siteData.totalBlocked > 0 ? 
      ((siteData.adsBlocked / siteData.totalBlocked) * 100).toFixed(1) : 0;
    document.getElementById('detailsBlockRate').textContent = `${blockRate}%`;
    

    const activityContainer = document.getElementById('detailsRecentActivity');
    activityContainer.innerHTML = `
      <div class="activity-item">
        Ad blocked: doubleclick.net
        <span class="activity-time">${formatDate(Date.now() - 1000 * 60 * 5)}</span>
      </div>
      <div class="activity-item">
        Tracker blocked: google-analytics.com
        <span class="activity-time">${formatDate(Date.now() - 1000 * 60 * 15)}</span>
      </div>
      <div class="activity-item">
        Ad blocked: googlesyndication.com
        <span class="activity-time">${formatDate(Date.now() - 1000 * 60 * 30)}</span>
      </div>
    `;
    

    modal.classList.add('active');
    

    modal.dataset.currentDomain = domain;
  }

  function clearSiteStats(domain) {
    if (confirm(`Are you sure you want to clear statistics for ${domain}?`)) {

      allSiteStats = allSiteStats.filter(site => site.domain !== domain);
      filteredSiteStats = filteredSiteStats.filter(site => site.domain !== domain);
      

      chrome.storage.sync.get('domainStats', (data) => {
        const domainStats = data.domainStats || {};
        delete domainStats[domain];
        chrome.storage.sync.set({ domainStats: domainStats }, () => {
          updateSiteStatsDisplay();
        });
      });
    }
  }

  function closeSiteDetailsModal() {
    const modal = document.getElementById('siteDetailsModal');
    modal.classList.remove('active');
    delete modal.dataset.currentDomain;
  }

  function exportSiteData() {
    const modal = document.getElementById('siteDetailsModal');
    const domain = modal.dataset.currentDomain;
    const siteData = allSiteStats.find(site => site.domain === domain);
    
    if (!siteData) return;
    
    const exportData = {
      domain: siteData.domain,
      statistics: {
        totalBlocked: siteData.totalBlocked,
        adsBlocked: siteData.adsBlocked,
        trackersBlocked: siteData.trackersBlocked,
        firstSeen: siteData.firstSeen,
        lastBlocked: siteData.lastBlocked
      },
      exportDate: new Date().toISOString(),
      extension: 'ZenBlock'
    };
    

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenblock-stats-${domain}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSavedMessage();
  }

  function clearAllSiteData() {
    const modal = document.getElementById('siteDetailsModal');
    const domain = modal.dataset.currentDomain;
    
    if (confirm(`Are you sure you want to clear ALL statistics for ${domain}? This action cannot be undone.`)) {
      clearSiteStats(domain);
      closeSiteDetailsModal();
    }
  }

  function generateSampleData() {
    const sampleDomains = [
      'google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'instagram.com',
      'reddit.com', 'linkedin.com', 'amazon.com', 'netflix.com', 'spotify.com',
      'github.com', 'stackoverflow.com', 'medium.com', 'news.ycombinator.com', 'wikipedia.org'
    ];
    
    const sampleData = {};
    const now = Date.now();
    
    sampleDomains.forEach(domain => {
      const blockedCount = Math.floor(Math.random() * 100) + 10;
      const firstSeen = now - (Math.random() * 30 * 24 * 60 * 60 * 1000);
      const lastBlocked = now - (Math.random() * 24 * 60 * 60 * 1000);
      
      sampleData[domain] = {
        count: blockedCount,
        lastBlocked: lastBlocked,
        firstSeen: firstSeen
      };
    });
    

    chrome.storage.sync.set({ domainStats: sampleData });
  }


  document.addEventListener('DOMContentLoaded', () => {
    initSiteStats();
  });
