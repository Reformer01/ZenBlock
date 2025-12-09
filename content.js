// ZenBlock Content Script - Element Hiding and CSS Injection
// Handles CSS-based element hiding rules (##selector)

class CSSInjector {
  constructor() {
    this.injectedStyles = new Map();
    this.domain = window.location.hostname;
    this.isInitialized = false;
    this.domObserver = null;
    this.processedElements = new WeakSet();
    this.adblockDetectors = new Set();
    this.dynamicRules = new Map();
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log(`ZenBlock CSS Injector initialized for ${this.domain}`);
    
    // Anti-adblock detection setup
    this.setupAntiDetection();
    
    // Get CSS rules from storage
    const cssRules = await this.getCSSRules();
    
    // Inject CSS for current domain
    await this.injectCSSRules(cssRules);
    
    // Set up message listener for dynamic updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateCSS') {
        this.injectCSSRules(message.cssRules || {});
        sendResponse({ success: true });
      } else if (message.action === 'hideElements') {
        this.hideElements(message.selectors || []);
        sendResponse({ success: true });
      }
    });
    
    this.isInitialized = true;
  }

  setupAntiDetection() {
    // YouTube-specific anti-adblock detection
    if (this.domain.includes('youtube.com')) {
      this.setupYouTubeAntiDetection();
    }
    
    // Prevent ad-block detection scripts from detecting our content script
    const originalQuerySelector = document.querySelector;
    const originalQuerySelectorAll = document.querySelectorAll;
    
    // Override common ad-block detection methods
    Object.defineProperty(document, 'querySelector', {
      value: function(selector) {
        // Block queries looking for ad-block detection elements
        if (selector.includes('adblock') || 
            selector.includes('adb') || 
            selector.includes('blocker') ||
            selector.includes('ad-block') ||
            selector.includes('adblocker') ||
            selector.includes('block-ads') ||
            selector.includes('adsblocked')) {
          return null;
        }
        return originalQuerySelector.call(this, selector);
      }
    });
    
    Object.defineProperty(document, 'querySelectorAll', {
      value: function(selector) {
        // Block queries looking for ad-block detection elements
        if (selector.includes('adblock') || 
            selector.includes('adb') || 
            selector.includes('blocker') ||
            selector.includes('ad-block') ||
            selector.includes('adblocker') ||
            selector.includes('block-ads') ||
            selector.includes('adsblocked')) {
          return [];
        }
        return originalQuerySelectorAll.call(this, selector);
      }
    });
    
    // Override getComputedStyle to hide our injected styles
    const originalGetComputedStyle = window.getComputedStyle;
    Object.defineProperty(window, 'getComputedStyle', {
      value: function(element, pseudoElt) {
        const style = originalGetComputedStyle.call(this, element, pseudoElt);
        
        // Hide display:none from our injected styles
        if (style && style.display === 'none' && 
            element.id && element.id.startsWith('zenblock-')) {
          const newStyle = new CSSStyleDeclaration();
          for (let i = 0; i < style.length; i++) {
            const prop = style[i];
            if (prop !== 'display') {
              newStyle.setProperty(prop, style.getPropertyValue(prop));
            }
          }
          newStyle.display = '';
          return newStyle;
        }
        
        return style;
      }
    });
    
    // Prevent detection of injected elements
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      value: function(x, y) {
        const element = originalElementFromPoint.call(this, x, y);
        if (element && element.id && element.id.startsWith('zenblock-')) {
          return null;
        }
        return element;
      }
    });
  }

  setupYouTubeAntiDetection() {
    // YouTube-specific anti-adblock bypasses
    console.log('Setting up YouTube anti-detection');
    
    // Override YouTube's ad detection functions
    if (window.yt && window.yt.config_) {
      // Disable YouTube's ad blocker detection
      Object.defineProperty(window.yt.config_, 'EXPERIMENT_FLAGS', {
        value: {
          ...window.yt.config_.EXPERIMENT_FLAGS,
          'kevlar_watch_metadata_refresh': true,
          'web_player_response_playback_tracking': false,
          'web_player_log_click_tracking': false
        },
        writable: false
      });
    }
    
    // Block YouTube's ad-related API calls
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      if (typeof url === 'string' && (
        url.includes('doubleclick.net') ||
        url.includes('googleads') ||
        url.includes('youtube.com/api/stats/playback') ||
        url.includes('youtube.com/api/stats/watchtime')
      )) {
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return originalFetch.call(this, url, options);
    };
    
    // Hide YouTube ad containers
    const hideYouTubeAds = () => {
      const adSelectors = [
        '.ytp-ad-module',
        '.ytp-ad-preview-container',
        '.ytp-ad-skip-button-container',
        '.ytp-ad-preview-text',
        '.ytp-ad-overlay-container',
        '.video-ads',
        '.ad-container',
        '.ytp-ad-text',
        '.ytp-ad-image',
        '.ytp-ad-button-container',
        '[data-ad-impression]',
        '[data-ad-skip]',
        '#player-ads',
        '#ad-container',
        '#watch7-sidebar-ads'
      ];
      
      adSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => this.hideElement(element));
      });
    };
    
    // Run YouTube ad hiding every 2 seconds
    setInterval(hideYouTubeAds, 2000);
    
    // Also run immediately
    hideYouTubeAds();
  }

  async getCSSRules() {
    try {
      const result = await chrome.storage.local.get(['cssRules']);
      return result.cssRules || {};
    } catch (error) {
      console.error('Failed to get CSS rules:', error);
      return {};
    }
  }

  async injectCSSRules(cssRules) {
    // Remove existing injected styles
    this.clearExistingStyles();

    // Collect applicable CSS rules for current domain
    const applicableRules = this.getApplicableRules(cssRules);
    
    if (applicableRules.length > 0) {
      const styleId = 'zenblock-element-hiding';
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = applicableRules.join('\n');
      
      // Inject into document head
      (document.head || document.documentElement).appendChild(styleElement);
      this.injectedStyles.set(styleId, styleElement);
      
      console.log(`Injected ${applicableRules.length} CSS rules for ${this.domain}`);
    }
  }

  getApplicableRules(cssRules) {
    const rules = [];
    const currentDomain = this.domain;
    const currentPath = window.location.pathname;
    
    // Global CSS rules (no domain specified)
    if (cssRules.global) {
      rules.push(...cssRules.global);
    }
    
    // Domain-specific CSS rules
    if (cssRules.domains && cssRules.domains[currentDomain]) {
      rules.push(...cssRules.domains[currentDomain]);
    }
    
    // Check for exception rules (@@)
    const exceptionRules = [];
    if (cssRules.exceptions && cssRules.exceptions[currentDomain]) {
      exceptionRules.push(...cssRules.exceptions[currentDomain]);
    }
    
    // Filter out rules that have exceptions
    return rules.filter(rule => {
      return !exceptionRules.some(exception => {
        // Simple matching - if exception selector is contained in rule
        return rule.includes(exception.replace('@@', ''));
      });
    });
  }

  observeDOM() {
    if (this.domObserver) {
      this.domObserver.disconnect();
    }

    this.domObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNewElement(node);
            }
          });
        }
      });
    });

    // Start observing the entire document
    this.domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style']
    });
  }

  processNewElement(element) {
    if (this.processedElements.has(element)) return;
    this.processedElements.add(element);

    // Check if element matches any ad patterns
    if (this.isAdElement(element)) {
      this.hideElement(element);
    }

    // Process child elements
    element.querySelectorAll('*').forEach(child => {
      if (!this.processedElements.has(child) && this.isAdElement(child)) {
        this.hideElement(child);
      }
    });
  }

  isAdElement(element) {
    // YouTube-specific ad detection
    if (this.domain.includes('youtube.com')) {
      return this.isYouTubeAdElement(element);
    }
    
    // Check for common ad indicators
    const elementId = element.id || '';
    const elementClass = element.className || '';
    const elementTag = element.tagName.toLowerCase();
    
    // Common ad-related keywords
    const adKeywords = [
      'ad', 'ads', 'advertisement', 'banner', 'sponsored', 'promo',
      'popup', 'modal', 'overlay', 'interstitial', 'commercial',
      'marketing', 'affiliate', 'doubleclick', 'googlesyndication',
      'amazon-ads', 'carbonads', 'adsystem', 'adserver'
    ];

    // Check ID and class for ad keywords
    const hasAdKeyword = adKeywords.some(keyword => 
      elementId.toLowerCase().includes(keyword) || 
      elementClass.toLowerCase().includes(keyword)
    );

    // Check for common ad container patterns
    const adPatterns = [
      /^ad[s]?[-_]?/,
      /[-_]?ad[s]?$/,
      /banner/,
      /sponsor/,
      /promo/,
      /commercial/,
      /marketing/
    ];

    const matchesAdPattern = adPatterns.some(pattern => 
      pattern.test(elementId) || pattern.test(elementClass)
    );

    // Check for suspicious attributes
    const hasSuspiciousAttrs = element.hasAttribute('data-ad') ||
                             element.hasAttribute('data-ads') ||
                             element.hasAttribute('data-adunit') ||
                             element.hasAttribute('data-google-ad-id');

    // Check iframe sources
    const isAdIframe = elementTag === 'iframe' && 
                      element.src && 
                      adKeywords.some(keyword => element.src.includes(keyword));

    // Check script elements
    const isAdScript = elementTag === 'script' && 
                      element.src && 
                      adKeywords.some(keyword => element.src.includes(keyword));

    return hasAdKeyword || matchesAdPattern || hasSuspiciousAttrs || isAdIframe || isAdScript;
  }

  isYouTubeAdElement(element) {
    const elementId = element.id || '';
    const elementClass = element.className || '';
    const elementTag = element.tagName.toLowerCase();
    
    // YouTube-specific ad selectors and patterns
    const youtubeAdPatterns = [
      'ytp-ad-module',
      'ytp-ad-preview-container',
      'ytp-ad-skip-button-container',
      'ytp-ad-preview-text',
      'ytp-ad-overlay-container',
      'video-ads',
      'ad-container',
      'ytp-ad-text',
      'ytp-ad-image',
      'ytp-ad-button-container'
    ];
    
    // Check if element matches YouTube ad patterns
    const matchesYouTubeAd = youtubeAdPatterns.some(pattern => 
      elementClass.includes(pattern) || elementId.includes(pattern)
    );
    
    // Check for YouTube ad attributes
    const hasYouTubeAdAttrs = element.hasAttribute('data-ad-impression') ||
                             element.hasAttribute('data-ad-skip') ||
                             element.hasAttribute('data-ad-click-tracking');
    
    // Check for YouTube ad-related IDs
    const youtubeAdIds = [
      'player-ads',
      'ad-container',
      'watch7-sidebar-ads'
    ];
    
    const hasYouTubeAdId = youtubeAdIds.includes(elementId);
    
    // Check for sponsored content indicators
    const isSponsored = elementClass.includes('sponsored') ||
                       elementClass.includes('paid-promotion') ||
                       element.textContent && element.textContent.toLowerCase().includes('sponsored');
    
    return matchesYouTubeAd || hasYouTubeAdAttrs || hasYouTubeAdId || isSponsored;
  }

  hideElement(element) {
    if (element.style) {
      element.style.display = 'none';
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
      element.style.width = '0';
      element.style.height = '0';
      element.style.overflow = 'hidden';
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      element.style.top = '-9999px';
    }
    
    // Mark as processed by ZenBlock
    element.setAttribute('data-zenblock-hidden', 'true');
  }

  hideElements(selectors) {
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => this.hideElement(element));
      } catch (error) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
    });
  }

  clearExistingStyles() {
    this.injectedStyles.forEach((styleElement, styleId) => {
      if (styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    });
    this.injectedStyles.clear();
  }
}

// Initialize CSS injector
const cssInjector = new CSSInjector();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    cssInjector.init().then(() => {
      cssInjector.observeDOM();
      // Process existing elements
      document.querySelectorAll('*').forEach(element => {
        cssInjector.processNewElement(element);
      });
    });
  });
} else {
  cssInjector.init().then(() => {
    cssInjector.observeDOM();
    // Process existing elements
    document.querySelectorAll('*').forEach(element => {
      cssInjector.processNewElement(element);
    });
  });
}

// Handle navigation changes (SPA support)
let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, reinitializing CSS injector');
    cssInjector.init();
  }
}).observe(document, { subtree: true, childList: true });

// Enhanced anti-detection measures
(() => {
  // Prevent detection of our content script
  Object.defineProperty(window, 'zenblock', {
    value: undefined,
    writable: true
  });
  
  // Block common ad-block detection scripts
  const scriptDetector = setInterval(() => {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.textContent && (
        script.textContent.includes('adblock') ||
        script.textContent.includes('adb') ||
        script.textContent.includes('blocker')
      )) {
        script.textContent = script.textContent.replace(/adblock|adb|blocker/gi, '');
      }
    });
  }, 1000);
  
  // Cleanup after 10 seconds
  setTimeout(() => clearInterval(scriptDetector), 10000);
})();

console.log('ZenBlock content script loaded');
