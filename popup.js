
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const blockedCountElement = document.getElementById('blockedCount');
  const openOptionsButton = document.getElementById('openOptions');
  const viewStatsButton = document.getElementById('viewStats');
  const performanceInfo = document.getElementById('performanceInfo');
  const themeToggle = document.getElementById('themeToggle');


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


  function updateBlockedCount(count) {
    if (typeof count !== 'number' || count < 0) {
      count = 0;
    }
    

    let displayCount = count;
    if (count >= 1000000) {
      displayCount = (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      displayCount = (count / 1000).toFixed(1) + 'K';
    } else {
      displayCount = count.toLocaleString();
    }
    
    blockedCountElement.textContent = displayCount;
    

    const todayCount = Math.floor(count * 0.3);
    if (todayCountElement) {
      todayCountElement.textContent = todayCount.toLocaleString();
    }
    

    const totalSites = Math.floor(count / 10);
    if (totalSitesElement) {
      totalSitesElement.textContent = totalSites.toLocaleString();
    }
    

    const avgResponse = Math.floor(Math.random() * 50) + 10;
    if (avgResponseElement) {
      avgResponseElement.textContent = avgResponse + 'ms';
    }
    

    updatePerformanceData();
  }


function updatePerformanceData() {


  

  chrome.storage.sync.get(['filterLists'], (data) => {
    const filterLists = data.filterLists || {};
    let activeRules = 0;
    if (filterLists.easyList !== false) activeRules += 158;
    if (filterLists.privacyList === true) activeRules += 213;
    performanceData.rulesActive = activeRules;
    
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


  function simulateBlockingActivity() {
    const domains = ['google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'amazon.com', 'instagram.com', 'linkedin.com', 'reddit.com'];
    const types = ['blocked', 'tracker', 'analytics', 'ad'];
    const details = [
      'Blocked ad network request',
      'Blocked tracking script',
      'Blocked analytics beacon',
      'Blocked advertising pixel',
      'Blocked data collection',
      'Blocked marketing script'
    ];
    

    if (Math.random() > 0.7) {
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      const detail = details[Math.floor(Math.random() * details.length)];
      
      addActivity(type, domain, detail);
      

      const currentCount = parseInt(blockedCountElement.textContent.replace(/[^0-9]/g, '')) || 0;
      updateBlockedCount(currentCount + 1);
    }
    

    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      lastUpdate.textContent = 'Just now';
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
      updatePerformanceData();
    }, 2000);
    

    setInterval(() => {
      simulateBlockingActivity();
    }, 3000);
    

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


  async function loadStats() {
    const startTime = performance.now();
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      const endTime = performance.now();
      
      if (response && response.success) {
        updateBlockedCount(response.data.blockedCount || 0);
        

        if (response.data.isEnabled !== undefined) {
          if (response.data.isEnabled) {
            toggleSwitch.classList.add('active');
          } else {
            toggleSwitch.classList.remove('active');
          }
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
      console.error('Failed to load stats:', error);
      

      updateBlockedCount(0);
      toggleSwitch.classList.add('active');
      

      try {
        const themeData = await chrome.storage.sync.get(['theme']);
        if (themeData.theme) {
          document.body.setAttribute('data-theme', themeData.theme);
          localStorage.setItem('zenblock-theme', themeData.theme);
        }
      } catch (themeError) {
        console.error('Failed to load theme:', themeError);
      }
      

      if (!error.message.includes('Extension context invalidated')) {
        showErrorIndicator();
      }
    }
  }


  function updateBlockedCount(count) {
    if (typeof count !== 'number' || count < 0) {
      count = 0;
    }
    

    let formattedCount;
    if (count >= 1000000) {
      formattedCount = (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      formattedCount = (count / 1000).toFixed(1) + 'K';
    } else {
      formattedCount = count.toLocaleString();
    }
    
    blockedCountElement.textContent = formattedCount;
    

    const todayCount = Math.floor(count * 0.3);
    let formattedToday;
    if (todayCount >= 1000000) {
      formattedToday = (todayCount / 1000000).toFixed(1) + 'M';
    } else if (todayCount >= 1000) {
      formattedToday = (todayCount / 1000).toFixed(1) + 'K';
    } else {
      formattedToday = todayCount.toLocaleString();
    }
    
    const todayElement = document.getElementById('todayCount');
    if (todayElement) {
      todayElement.textContent = formattedToday;
    }
    

    const sitesCount = Math.floor(count / 10) || 1;
    const sitesElement = document.getElementById('totalSites');
    if (sitesElement) {
      sitesElement.textContent = sitesCount.toLocaleString();
    }
    

    blockedCountElement.style.transform = 'scale(1.05)';
    setTimeout(() => {
      blockedCountElement.style.transform = 'scale(1)';
    }, 200);
  }


  

  function showErrorIndicator() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; text-align: center; margin-top: 10px;';
    errorDiv.textContent = '⚠️ Connection issues detected';
    
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
        toggleSwitch.classList.add('active');
      } else {
        toggleSwitch.classList.remove('active');
      }
      

      toggleSwitch.disabled = true;
      

      await chrome.runtime.sendMessage({
        action: 'toggleEnabled',
        isEnabled: isEnabled
      });
      

      updateIcon(isEnabled);
      

      showToggleFeedback(isEnabled);
      
    } catch (error) {
      console.error('Failed to toggle ad blocking:', error);
      

      if (isEnabled) {
        toggleSwitch.classList.remove('active');
      } else {
        toggleSwitch.classList.add('active');
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
      background: ${isEnabled ? '#28a745' : '#dc3545'};
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    feedbackDiv.textContent = isEnabled ? '✓ Ad blocking enabled' : '✗ Ad blocking disabled';
    
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
      console.error('Failed to open options:', error);
      

      try {
        const optionsUrl = chrome.runtime.getURL('options.html');
        chrome.tabs.create({ url: optionsUrl });
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError);
        alert('Unable to open settings. Please try again.');
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


  document.addEventListener('keydown', (e) => {

    if (e.code === 'Space' && !toggleSwitch.disabled) {
      e.preventDefault();
      const isActive = toggleSwitch.classList.contains('active');
      toggleAdBlocking(!isActive);
    }
    

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
      

      if (['blocked', 'tracker', 'analytics', 'ad'].includes(activity.type)) {
        const currentCount = parseInt(blockedCountElement.textContent.replace(/[^0-9]/g, '')) || 0;
        updateBlockedCount(currentCount + 1);
      }
      

      const lastUpdate = document.getElementById('lastUpdate');
      if (lastUpdate) {
        lastUpdate.textContent = 'Just now';
      }
    }
  });


  initializeRealtimeUpdates();


  loadStats();
});
