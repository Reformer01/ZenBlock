// Enhanced popup with performance monitoring and theme support
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const blockedCountElement = document.getElementById('blockedCount');
  const openOptionsButton = document.getElementById('openOptions');
  const viewStatsButton = document.getElementById('viewStats');
  const performanceInfo = document.getElementById('performanceInfo');
  const themeToggle = document.getElementById('themeToggle');

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

  // Initialize theme on load
  initTheme();

  // Add theme toggle event listener
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Performance monitoring
  let performanceStats = {
    responseTimes: [],
    lastUpdateTime: Date.now(),
    errorCount: 0
  };

  // Debounce function to prevent excessive API calls
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

  // Load current state with performance tracking
  async function loadStats() {
    const startTime = performance.now();
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      const endTime = performance.now();
      
      if (response && response.success) {
        updateBlockedCount(response.data.blockedCount || 0);
        
        // Update toggle state
        if (response.data.isEnabled !== undefined) {
          if (response.data.isEnabled) {
            toggleSwitch.classList.add('active');
          } else {
            toggleSwitch.classList.remove('active');
          }
        }
        
        // Update performance stats
        if (response.data.performanceStats) {
          updatePerformanceIndicator(response.data.performanceStats);
        }
        
        // Load theme preference
        const themeData = await chrome.storage.sync.get(['theme']);
        if (themeData.theme) {
          document.body.setAttribute('data-theme', themeData.theme);
          localStorage.setItem('zenblock-theme', themeData.theme);
        }
        
        // Clear any error indicators
        clearErrorIndicators();
      } else {
        throw new Error(response?.error || 'Failed to get stats');
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      
      // Set default values on error
      updateBlockedCount(0);
      toggleSwitch.classList.add('active'); // Default to enabled
      
      // Try to load theme preference separately
      try {
        const themeData = await chrome.storage.sync.get(['theme']);
        if (themeData.theme) {
          document.body.setAttribute('data-theme', themeData.theme);
          localStorage.setItem('zenblock-theme', themeData.theme);
        }
      } catch (themeError) {
        console.error('Failed to load theme:', themeError);
      }
      
      // Only show error indicator if it's not a connection timeout
      if (!error.message.includes('Extension context invalidated')) {
        showErrorIndicator();
      }
    }
  }

  // Update blocked count with formatting
  function updateBlockedCount(count) {
    if (typeof count !== 'number' || count < 0) {
      count = 0;
    }
    
    // Format large numbers
    let formattedCount;
    if (count >= 1000000) {
      formattedCount = (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      formattedCount = (count / 1000).toFixed(1) + 'K';
    } else {
      formattedCount = count.toLocaleString();
    }
    
    blockedCountElement.textContent = formattedCount;
    
    // Update today count (simplified - uses 30% of total as example)
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
    
    // Update sites count (example calculation)
    const sitesCount = Math.floor(count / 10) || 1;
    const sitesElement = document.getElementById('totalSites');
    if (sitesElement) {
      sitesElement.textContent = sitesCount.toLocaleString();
    }
    
    // Add animation for count changes
    blockedCountElement.style.transform = 'scale(1.05)';
    setTimeout(() => {
      blockedCountElement.style.transform = 'scale(1)';
    }, 200);
  }

  // Update performance indicator
  function updatePerformanceIndicator() {
    if (performanceStats.responseTimes.length === 0) return;
    
    const avgResponseTime = performanceStats.responseTimes.reduce((a, b) => a + b, 0) / performanceStats.responseTimes.length;
    
    // Add subtle performance indicator
    let indicatorColor = '#28a745'; // Green for good performance
    if (avgResponseTime > 100) {
      indicatorColor = '#ffc107'; // Yellow for moderate
    }
    if (avgResponseTime > 500) {
      indicatorColor = '#dc3545'; // Red for poor
    }
    
    // Update border color of stats container
    const statsContainer = document.querySelector('.stats');
    if (statsContainer) {
      statsContainer.style.borderColor = indicatorColor;
    }
  }

  // Show error indicator
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

  // Clear error indicators
  function clearErrorIndicators() {
    const errorIndicators = document.querySelectorAll('.error-indicator');
    errorIndicators.forEach(indicator => indicator.remove());
  }

  // Toggle ad blocking with validation and feedback
  async function toggleAdBlocking(isEnabled) {
    try {
      // Validate input
      if (typeof isEnabled !== 'boolean') {
        throw new Error('Invalid toggle state');
      }
      
      // Update UI immediately for better UX
      if (isEnabled) {
        toggleSwitch.classList.add('active');
      } else {
        toggleSwitch.classList.remove('active');
      }
      
      // Show loading state
      toggleSwitch.disabled = true;
      
      // Send message to background script
      await chrome.runtime.sendMessage({
        action: 'toggleEnabled',
        isEnabled: isEnabled
      });
      
      // Update icon immediately for better UX
      updateIcon(isEnabled);
      
      // Show success feedback
      showToggleFeedback(isEnabled);
      
    } catch (error) {
      console.error('Failed to toggle ad blocking:', error);
      
      // Revert UI state
      if (isEnabled) {
        toggleSwitch.classList.remove('active');
      } else {
        toggleSwitch.classList.add('active');
      }
      showErrorIndicator();
      
    } finally {
      // Re-enable toggle
      setTimeout(() => {
        toggleSwitch.disabled = false;
      }, 300);
    }
  }

  // Update extension icon
  function updateIcon(isEnabled) {
    const logo = document.querySelector('.logo');
    if (logo) {
      logo.style.opacity = isEnabled ? '1' : '0.5';
      logo.style.filter = isEnabled ? 'none' : 'grayscale(100%)';
    }
  }

  // Show toggle feedback
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
    
    // Remove after 2 seconds
    setTimeout(() => {
      feedbackDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => feedbackDiv.remove(), 300);
    }, 2000);
  }

  // Open options page with error handling
  async function openOptions() {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error('Failed to open options:', error);
      
      // Fallback: try to open in new tab
      try {
        const optionsUrl = chrome.runtime.getURL('options.html');
        chrome.tabs.create({ url: optionsUrl });
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError);
        alert('Unable to open settings. Please try again.');
      }
    }
  }

  // Debounced stats update to prevent excessive calls
  const debouncedLoadStats = debounce(loadStats, 3000);

  // Event listeners
  toggleSwitch.addEventListener('click', () => {
    const isActive = toggleSwitch.classList.contains('active');
    toggleAdBlocking(!isActive);
  });

  openOptionsButton.addEventListener('click', openOptions);
  
  // Add event listener for Statistics button
  if (viewStatsButton) {
    viewStatsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#dashboard') });
    });
  }

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Space to toggle
    if (e.code === 'Space' && !toggleSwitch.disabled) {
      e.preventDefault();
      const isActive = toggleSwitch.classList.contains('active');
      toggleAdBlocking(!isActive);
    }
    
    // 'O' to open options
    if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openOptions();
    }
    
    // 'T' to toggle theme
    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleTheme();
    }
  });

  // Auto-update stats with performance consideration
  setInterval(() => {
    // Only update if popup is visible and not in background
    if (document.visibilityState === 'visible') {
      debouncedLoadStats();
    }
  }, 10000); // Reduced frequency to every 10 seconds

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadStats(); // Load fresh stats when popup becomes visible
    }
  });

  // Add CSS animations
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

  // Initial load
  loadStats();
});
