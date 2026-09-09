
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const blockedCountElement = document.getElementById('blockedCount');
  const openOptionsButton = document.getElementById('openOptions');
  const viewStatsButton = document.getElementById('viewStats');
  const themeToggle = document.getElementById('themeToggle');

  function initTheme() {
    const savedTheme = localStorage.getItem('zenblock-theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeToggle(savedTheme);
  }

  function updateThemeToggle(theme) {
    if (themeToggle) {
      themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
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

  initTheme();

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  const todayCountElement = document.getElementById('todayCount');
  const totalSitesElement = document.getElementById('totalSites');
  const avgResponseElement = document.getElementById('avgResponse');

  let recentActivity = [];
  let performanceData = {
    rulesActive: 0,
    avgResponseTime: 0
  };

function updatePerformanceData() {
  chrome.storage.sync.get(['performanceStats'], (data) => {
    const stored = data.performanceStats || {};
    performanceData = {
      rulesActive: stored.rulesActive || 0,
      avgResponseTime: stored.avgResponseTime || 0,
      blockedToday: stored.blockedToday || 0,
      totalBlocked: stored.totalBlocked || 0,
      totalSites: stored.totalSites || 0
    };
    
    updatePerformanceUI();
  });
}

function updatePerformanceUI() {

  const cpuSection = document.getElementById('cpuUsage')?.parentElement;
  const memorySection = document.getElementById('memoryUsage')?.parentElement;
  if (cpuSection) cpuSection.style.display = 'none';
  if (memorySection) memorySection.style.display = 'none';
  

  const rulesUsage = document.getElementById('rulesUsage');
  const rulesValue = document.getElementById('rulesValue');
  if (rulesUsage && rulesValue) {
    const rulesPercent = Math.min((performanceData.rulesActive / 500) * 100, 100);
    rulesUsage.style.width = rulesPercent + '%';
    rulesValue.textContent = performanceData.rulesActive;
  }
}

  function addActivity(type, domain, details = '') {
    const activity = {
      type: type,
      domain: domain,
      details: details,
      timestamp: Date.now()
    };
    

    recentActivity.unshift(activity);
    

    if (recentActivity.length > 10) {
      recentActivity = recentActivity.slice(0, 10);
    }
    
    updateActivityDisplay();
  }

  function updateActivityDisplay() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    
    activityList.innerHTML = '';
    
    recentActivity.forEach(activity => {
      const activityItem = document.createElement('div');
      activityItem.className = 'activity-item';
      
      const timeAgo = getTimeAgo(activity.timestamp);
      const activityText = getActivityText(activity);
      
      activityItem.innerHTML = `
        <div class="activity-icon ${activity.type}"></div>
        <div class="activity-details">
          <div class="activity-text">${activityText}</div>
          <div class="activity-time">${timeAgo}</div>
        </div>
      `;
      
      activityList.appendChild(activityItem);
    });
  }

  function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function getActivityText(activity) {
    const { type, domain, details } = activity;
    
    switch (type) {
      case 'blocked':
        return details || `Blocked content on ${domain}`;
      case 'tracker':
        return `Blocked tracker on ${domain}`;
      case 'analytics':
        return `Blocked analytics on ${domain}`;
      case 'ad':
        return `Blocked ad on ${domain}`;
      default:
        return `Blocked content on ${domain}`;
    }
  }

  function updatePerformanceIndicator(stats) {
    const indicator = document.getElementById('performanceIndicator');
    if (!indicator) return;
    

    let status = 'good';
    if (stats.avgResponseTime > 100) status = 'warning';
    if (stats.avgResponseTime > 200) status = 'poor';
    

    const colors = {
      good: 'var(--success-color)',
      warning: 'var(--secondary-color)',
      poor: 'var(--danger-color)'
    };
    
    indicator.style.background = colors[status] || colors.good;
  }

  function initializeRealtimeUpdates() {

    setInterval(() => {
      loadStats();
    }, 15000);
    

    setInterval(() => {
      const lastUpdate = document.getElementById('lastUpdate');
      if (lastUpdate && recentActivity.length > 0) {
        const lastActivity = recentActivity[0];
        lastUpdate.textContent = getTimeAgo(lastActivity.timestamp);
      }
    }, 30000);
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function setToggleState(enabled) {
    toggleSwitch.classList.toggle('active', enabled);
    toggleSwitch.setAttribute('aria-checked', String(enabled));
  }

  async function loadStats() {
    const startTime = performance.now();
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      const endTime = performance.now();
      
      if (response && response.success) {
        const perfStats = response.data.performanceStats || {};
        if (typeof response.data.totalSites === 'number') {
          perfStats.totalSites = response.data.totalSites;
        } else if (typeof perfStats.totalSites !== 'number') {
          perfStats.totalSites = 0;
        }
        updateBlockedCount(response.data.blockedCount || 0, perfStats);
        

        if (response.data.isEnabled !== undefined) {
          setToggleState(response.data.isEnabled);
        }
        

        if (response.data.performanceStats) {
          updatePerformanceIndicator(response.data.performanceStats);
        }
        

        const themeData = await chrome.storage.sync.get(['theme']);
        if (themeData.theme) {
          document.body.setAttribute('data-theme', themeData.theme);
          localStorage.setItem('zenblock-theme', themeData.theme);
        }
        

        clearErrorIndicators();
      } else {
        throw new Error(response?.error || 'Failed to get stats');
      }
    } catch (error) {
      

      updateBlockedCount(0);
      setToggleState(true);
      

      try {
        const themeData = await chrome.storage.sync.get(['theme']);
        if (themeData.theme) {
          document.body.setAttribute('data-theme', themeData.theme);
          localStorage.setItem('zenblock-theme', themeData.theme);
        }
      } catch (themeError) {}
      

      if (!error.message.includes('Extension context invalidated')) {
        showErrorIndicator();
      }
    }
  }

  function updateBlockedCount(count, stats) {
    if (typeof count !== 'number' || count < 0) {
      count = 0;
    }
    const safeStats = stats && typeof stats === 'object' ? stats : {};

    const formatCount = (value) => {
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
      } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
      }
      return value.toLocaleString();
    };

    const totalBlocked = typeof safeStats.totalBlocked === 'number' ? safeStats.totalBlocked : count;
    blockedCountElement.textContent = formatCount(totalBlocked);

    const todayElement = document.getElementById('todayCount');
    if (todayElement) {
      const today = typeof safeStats.blockedToday === 'number' ? safeStats.blockedToday : 0;
      todayElement.textContent = formatCount(today);
    }

    const sitesElement = document.getElementById('totalSites');
    if (sitesElement) {
      const siteCount = typeof safeStats.totalSites === 'number' ? safeStats.totalSites : 0;
      sitesElement.textContent = siteCount.toLocaleString();
    }

    const avgElement = document.getElementById('avgResponse');
    if (avgElement) {
      const avg = typeof safeStats.avgResponseTime === 'number' ? safeStats.avgResponseTime : 0;
      avgElement.textContent = avg >= 1000 ? (avg / 1000).toFixed(1) + 's' : Math.round(avg) + 'ms';
    }

    blockedCountElement.style.transform = 'scale(1.05)';
    setTimeout(() => {
      blockedCountElement.style.transform = 'scale(1)';
    }, 200);
  }

  function showErrorIndicator() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; text-align: center; margin-top: 10px;';
    errorDiv.innerHTML = '<span class="status-icon status-icon-warning"></span>Connection issues detected';
    
    const footer = document.querySelector('.footer');
    if (footer && !footer.querySelector('.error-indicator')) {
      errorDiv.className = 'error-indicator';
      footer.appendChild(errorDiv);
    }
  }

  function clearErrorIndicators() {
    const errorIndicators = document.querySelectorAll('.error-indicator');
    errorIndicators.forEach(indicator => indicator.remove());
  }

  async function toggleAdBlocking(isEnabled) {
    try {

      if (typeof isEnabled !== 'boolean') {
        throw new Error('Invalid toggle state');
      }
      

      if (isEnabled) {
        setToggleState(true);
      } else {
        setToggleState(false);
      }
      

      toggleSwitch.disabled = true;
      

      await chrome.runtime.sendMessage({
        action: 'toggleEnabled',
        isEnabled: isEnabled
      });
      

      updateIcon(isEnabled);
      

      showToggleFeedback(isEnabled);
      
    } catch (error) {
      

      if (isEnabled) {
        setToggleState(false);
      } else {
        setToggleState(true);
      }
      showErrorIndicator();
      
    } finally {

      setTimeout(() => {
        toggleSwitch.disabled = false;
      }, 300);
    }
  }

  function updateIcon(isEnabled) {
    const logo = document.querySelector('.logo');
    if (logo) {
      logo.style.opacity = isEnabled ? '1' : '0.5';
      logo.style.filter = isEnabled ? 'none' : 'grayscale(100%)';
    }
  }

  function showToggleFeedback(isEnabled) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${isEnabled ? '#1e7e34' : '#dc3545'};
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    feedbackDiv.innerHTML = isEnabled
      ? '<span class="status-icon status-icon-check"></span>Ad blocking enabled'
      : '<span class="status-icon status-icon-x"></span>Ad blocking disabled';
    
    document.body.appendChild(feedbackDiv);
    

    setTimeout(() => {
      feedbackDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => feedbackDiv.remove(), 300);
    }, 2000);
  }

  async function openOptions() {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      

      try {
        const optionsUrl = chrome.runtime.getURL('options.html');
        chrome.tabs.create({ url: optionsUrl });
      } catch (fallbackError) {
        showErrorIndicator();
      }
    }
  }

  const debouncedLoadStats = debounce(loadStats, 3000);

  toggleSwitch.addEventListener('click', () => {
    const isActive = toggleSwitch.classList.contains('active');
    toggleAdBlocking(!isActive);
  });

  openOptionsButton.addEventListener('click', openOptions);
  

  if (viewStatsButton) {
    viewStatsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#dashboard') });
    });
  }

  toggleSwitch.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!toggleSwitch.disabled) {
        const isActive = toggleSwitch.classList.contains('active');
        toggleAdBlocking(!isActive);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openOptions();
    }
    

    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleTheme();
    }
  });

  setInterval(() => {

    if (document.visibilityState === 'visible') {
      debouncedLoadStats();
    }
  }, 10000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadStats();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    
    .stats {
      transition: border-color 0.3s ease;
      border: 2px solid #e0e0e0;
    }
    
    .logo {
      transition: opacity 0.3s ease, filter 0.3s ease;
    }
    
    #blockedCount {
      transition: transform 0.2s ease;
    }
    
    input[type="checkbox"]:disabled + .slider {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'activityUpdate') {
      const activity = request.activity;
      

      addActivity(activity.type, activity.domain, activity.details);
      loadStats();
      

      const lastUpdate = document.getElementById('lastUpdate');
      if (lastUpdate) {
        lastUpdate.textContent = 'Just now';
      }
    }
  });

  initializeRealtimeUpdates();

  loadStats();
});
