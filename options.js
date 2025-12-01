// Enhanced options page with robust validation, security, and modern navigation
document.addEventListener('DOMContentLoaded', () => {
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelist');
  const whitelistContainer = document.getElementById('whitelistContainer');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const savedMessage = document.getElementById('savedMessage');
  const errorMessage = document.getElementById('errorMessage');
  const enableEasyList = document.getElementById('enableEasyList');
  const enablePrivacyList = document.getElementById('enablePrivacyList');
  const updateFrequency = document.getElementById('updateFrequency');
  const themeToggle = document.getElementById('themeToggle');

  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const contentSections = document.querySelectorAll('.content-section');

  // Theme management
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
    
    // Save theme preference to extension storage
    chrome.storage.sync.set({ theme: newTheme });
  }

  // Toggle switch functionality for form checkboxes
  function setupToggleSwitches() {
    const toggleContainers = document.querySelectorAll('.form-checkbox');
    
    toggleContainers.forEach(container => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      const toggleSwitch = container.querySelector('.toggle-switch');
      
      if (checkbox && toggleSwitch) {
        // Initialize toggle state based on checkbox
        if (checkbox.checked) {
          toggleSwitch.classList.add('active');
        }
        
        // Add click handler to toggle switch
        toggleSwitch.addEventListener('click', () => {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            toggleSwitch.classList.add('active');
          } else {
            toggleSwitch.classList.remove('active');
          }
          // Trigger change event for auto-save
          checkbox.dispatchEvent(new Event('change'));
        });
        
        // Add change handler to checkbox
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

  // Initialize theme on load
  initTheme();

  // Setup toggle switches
  setupToggleSwitches();

  // Add theme toggle event listener
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Navigation functionality
  function switchSection(sectionId) {
    // Update navigation
    navItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      }
    });

    // Update content
    contentSections.forEach(section => {
      section.classList.remove('active');
      if (section.id === sectionId) {
        section.classList.add('active');
      }
    });

    // Update URL hash
    window.location.hash = sectionId;
  }

  // Add navigation event listeners
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.getAttribute('data-section');
      switchSection(sectionId);
    });
  });

  // Handle initial hash
  const initialHash = window.location.hash.substring(1);
  if (initialHash && document.getElementById(initialHash)) {
    switchSection(initialHash);
  }

  // Dashboard stats update
  function updateDashboardStats(data) {
    // Update main stats
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
      uptimeCount.textContent = '100%'; // Simplified for now
    }

    // Update performance stats
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

    // Update last update time
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate && data.lastFilterUpdate) {
      const date = new Date(data.lastFilterUpdate);
      lastUpdate.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  }

  // Enhanced domain validation
  function validateDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return { valid: false, error: 'Domain is required' };
    }

    domain = domain.trim().toLowerCase();
    
    // Length validation
    if (domain.length < 3) {
      return { valid: false, error: 'Domain must be at least 3 characters' };
    }
    
    if (domain.length > 253) {
      return { valid: false, error: 'Domain is too long (max 253 characters)' };
    }

    // Basic format validation
    if (!/^[a-z0-9.-]+$/.test(domain)) {
      return { valid: false, error: 'Domain can only contain letters, numbers, dots, and hyphens' };
    }

    // Structural validation
    if (domain.startsWith('.') || domain.endsWith('.')) {
      return { valid: false, error: 'Domain cannot start or end with a dot' };
    }

    if (domain.includes('..')) {
      return { valid: false, error: 'Domain cannot contain consecutive dots' };
    }

    // Check for invalid patterns
    const invalidPatterns = [
      /^\./,           // Starts with dot
      /\.$/,           // Ends with dot
      /\.\./,          // Consecutive dots
      /^-/,            // Starts with hyphen
      /-$/,            // Ends with hyphen
      /--/,            // Consecutive hyphens
      /^\d+\.\d+\.\d+\.\d+$/, // IP addresses
      /^[a-f0-9:]+:[a-f0-9:]+$/i // IPv6 addresses
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(domain)) {
        return { valid: false, error: 'Invalid domain format' };
      }
    }

    // TLD validation
    const parts = domain.split('.');
    if (parts.length < 2) {
      return { valid: false, error: 'Domain must have at least one dot' };
    }

    const tld = parts[parts.length - 1];
    if (tld.length < 2) {
      return { valid: false, error: 'Top-level domain must be at least 2 characters' };
    }

    // Check for valid TLD patterns
    if (!/^[a-z]{2,}$/.test(tld)) {
      return { valid: false, error: 'Invalid top-level domain' };
    }

    // Check for reserved domains
    const reservedDomains = [
      'localhost', 'example.com', 'example.org', 'example.net',
      'test.com', 'invalid.com', 'reserved.com'
    ];

    if (reservedDomains.includes(domain)) {
      return { valid: false, error: 'This domain is reserved and cannot be whitelisted' };
    }

    return { valid: true, domain };
  }

  // Enhanced domain matching for subdomains
  function matchesDomain(url, whitelistedDomain) {
    try {
      const urlDomain = new URL(url).hostname.toLowerCase();
      const whitelistDomain = whitelistedDomain.toLowerCase();

      // Exact match
      if (urlDomain === whitelistDomain) {
        return true;
      }

      // Subdomain match (e.g., sub.example.com matches example.com)
      if (urlDomain.endsWith('.' + whitelistDomain)) {
        return true;
      }

      // Wildcard support
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

  // Sanitize input to prevent XSS
  function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  // Show error message
  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
    errorDiv.textContent = message;
    
    // Remove existing error messages
    if (whitelistInput && whitelistInput.parentNode) {
      const existingErrors = whitelistInput.parentNode.querySelectorAll('.error-message');
      existingErrors.forEach(err => err.remove());
      
      errorDiv.className = 'error-message';
      whitelistInput.parentNode.appendChild(errorDiv);
      
      // Auto-remove after 5 seconds
      setTimeout(() => errorDiv.remove(), 5000);
    } else {
      console.error('Cannot show error message - whitelistInput or parent not found:', message);
    }
  }

  // Load saved settings with error handling
  async function loadSettings() {
    try {
      const data = await chrome.storage.sync.get(['whitelist', 'filterLists', 'updateFrequency', 'performanceStats', 'theme']);
      
      // Load theme preference
      if (data.theme) {
        document.body.setAttribute('data-theme', data.theme);
        localStorage.setItem('zenblock-theme', data.theme);
        updateThemeToggle(data.theme);
      }
      
      // Load whitelist with validation
      const whitelist = Array.isArray(data.whitelist) ? data.whitelist.filter(domain => {
        const validation = validateDomain(domain);
        return validation.valid;
      }) : [];
      
      updateWhitelistDisplay(whitelist);

      // Load filter list settings
      const filterLists = data.filterLists || { easyList: true, privacyList: false };
      if (enableEasyList) enableEasyList.checked = filterLists.easyList !== false;
      if (enablePrivacyList) enablePrivacyList.checked = filterLists.privacyList || false;

      // Load update frequency
      if (updateFrequency) updateFrequency.value = data.updateFrequency || '7';

      // Update dashboard stats
      updateDashboardStats(data);

      // Setup toggle switches after loading settings
      setupToggleSwitches();

    } catch (error) {
      console.error('Failed to load settings:', error);
      showError('Failed to load settings. Please refresh the page.');
    }
  }

  // Display performance statistics
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

  // Add domain to whitelist with enhanced validation
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
      
      // Check for duplicates (case-insensitive)
      const normalizedDomain = validation.domain.toLowerCase();
      if (whitelist.some(d => d.toLowerCase() === normalizedDomain)) {
        showError('Domain is already whitelisted');
        return;
      }

      // Add to whitelist
      whitelist.push(normalizedDomain);
      await chrome.storage.sync.set({ whitelist });
      
      // Update display
      updateWhitelistDisplay(whitelist);
      whitelistInput.value = '';
      
      // Notify background script
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

  // Update whitelist display with enhanced UI
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

  // Remove domain from whitelist
  async function removeFromWhitelist(domain) {
    try {
      const data = await chrome.storage.sync.get(['whitelist']);
      const whitelist = (data.whitelist || []).filter(d => d.toLowerCase() !== domain.toLowerCase());
      
      await chrome.storage.sync.set({ whitelist });
      updateWhitelistDisplay(whitelist);
      showSavedMessage();
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'updateWhitelist',
        whitelist: whitelist
      });
      
    } catch (error) {
      console.error('Failed to remove from whitelist:', error);
      showError('Failed to remove domain from whitelist');
    }
  }

  // Test if a domain is currently being blocked
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

  // Save all settings with validation
  async function saveAllSettings() {
    try {
      // Validate all whitelist domains
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

      // Get current theme
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
      
      // Reload filter lists if needed
      chrome.runtime.sendMessage({ action: 'reloadFilters' });
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      showError('Failed to save settings');
    }
  }

  // Show saved message
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

  // Event listeners
  if (addWhitelistBtn) addWhitelistBtn.addEventListener('click', addToWhitelist);
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveAllSettings);
  
  // Reset settings button
  const resetSettingsBtn = document.getElementById('resetSettings');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all settings to defaults? This will clear your whitelist and restore default settings.')) {
        try {
          // Clear all storage
          await chrome.storage.sync.clear();
          await chrome.storage.local.clear();
          
          // Reset to defaults
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
          
          // Reload the page to refresh UI
          window.location.reload();
          
        } catch (error) {
          console.error('Failed to reset settings:', error);
          showError('Failed to reset settings');
        }
      }
    });
  }

  // Whitelist container event delegation
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

  // Enter key support for whitelist input
  if (whitelistInput) {
    whitelistInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addToWhitelist();
      }
    });
  }

  // Auto-save on filter list changes
  [enableEasyList, enablePrivacyList, updateFrequency].forEach(element => {
    if (element) {
      element.addEventListener('change', () => {
        saveAllSettings();
      });
    }
  });

  // Load settings on startup
  loadSettings();
});
