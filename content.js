


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
    

    this.setupAntiDetection();
    

    const cssRules = await this.getCSSRules();
    

    await this.injectCSSRules(cssRules);
    

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

    if (this.domain.includes('youtube.com')) {
      this.setupYouTubeAntiDetection();
    }
    

    const originalQuerySelector = document.querySelector;
    const originalQuerySelectorAll = document.querySelectorAll;
    

    Object.defineProperty(document, 'querySelector', {
      value: function(selector) {

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
    

    const originalGetComputedStyle = window.getComputedStyle;
    Object.defineProperty(window, 'getComputedStyle', {
      value: function(element, pseudoElt) {
        const style = originalGetComputedStyle.call(this, element, pseudoElt);
        

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

    console.log('Setting up YouTube anti-detection');
    

    if (window.yt && window.yt.config_) {

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
    

    setInterval(hideYouTubeAds, 2000);
    

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

    this.clearExistingStyles();


    const applicableRules = this.getApplicableRules(cssRules);
    
    if (applicableRules.length > 0) {
      const styleId = 'zenblock-element-hiding';
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = applicableRules.join('\n');
      

      (document.head || document.documentElement).appendChild(styleElement);
      this.injectedStyles.set(styleId, styleElement);
      
      console.log(`Injected ${applicableRules.length} CSS rules for ${this.domain}`);
    }
  }

  getApplicableRules(cssRules) {
    const rules = [];
    const currentDomain = this.domain;
    const currentPath = window.location.pathname;
    

    if (cssRules.global) {
      rules.push(...cssRules.global);
    }
    

    if (cssRules.domains && cssRules.domains[currentDomain]) {
      rules.push(...cssRules.domains[currentDomain]);
    }
    

    const exceptionRules = [];
    if (cssRules.exceptions && cssRules.exceptions[currentDomain]) {
      exceptionRules.push(...cssRules.exceptions[currentDomain]);
    }
    

    return rules.filter(rule => {
      return !exceptionRules.some(exception => {

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


    if (this.isAdElement(element)) {
      this.hideElement(element);
    }


    element.querySelectorAll('*').forEach(child => {
      if (!this.processedElements.has(child) && this.isAdElement(child)) {
        this.hideElement(child);
      }
    });
  }

  isAdElement(element) {

    if (this.domain.includes('youtube.com')) {
      return this.isYouTubeAdElement(element);
    }
    

    const elementId = element.id || '';
    const elementClass = (element.className && typeof element.className === 'string') ? element.className : (element.className && element.className.toString()) || '';
    const elementTag = element.tagName.toLowerCase();
    

    const adKeywords = [
      'ad', 'ads', 'advertisement', 'banner', 'sponsored', 'promo',
      'popup', 'modal', 'overlay', 'interstitial', 'commercial',
      'marketing', 'affiliate', 'doubleclick', 'googlesyndication',
      'amazon-ads', 'carbonads', 'adsystem', 'adserver'
    ];


    const hasAdKeyword = adKeywords.some(keyword => 
      elementId.toLowerCase().includes(keyword) || 
      elementClass.toLowerCase().includes(keyword)
    );


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


    const hasSuspiciousAttrs = element.hasAttribute('data-ad') ||
                             element.hasAttribute('data-ads') ||
                             element.hasAttribute('data-adunit') ||
                             element.hasAttribute('data-google-ad-id');


    const isAdIframe = elementTag === 'iframe' && 
                      element.src && 
                      adKeywords.some(keyword => element.src.includes(keyword));


    const isAdScript = elementTag === 'script' && 
                      element.src && 
                      adKeywords.some(keyword => element.src.includes(keyword));

    return hasAdKeyword || matchesAdPattern || hasSuspiciousAttrs || isAdIframe || isAdScript;
  }

  isYouTubeAdElement(element) {
    const elementId = element.id || '';
    const elementClass = (element.className && typeof element.className === 'string') ? element.className : (element.className && element.className.toString()) || '';
    const elementTag = element.tagName.toLowerCase();
    

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
    

    const matchesYouTubeAd = youtubeAdPatterns.some(pattern => 
      elementClass.includes(pattern) || elementId.includes(pattern)
    );
    

    const hasYouTubeAdAttrs = element.hasAttribute('data-ad-impression') ||
                             element.hasAttribute('data-ad-skip') ||
                             element.hasAttribute('data-ad-click-tracking');
    

    const youtubeAdIds = [
      'player-ads',
      'ad-container',
      'watch7-sidebar-ads'
    ];
    
    const hasYouTubeAdId = youtubeAdIds.includes(elementId);
    

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


const cssInjector = new CSSInjector();


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    cssInjector.init().then(() => {
      cssInjector.observeDOM();

      document.querySelectorAll('*').forEach(element => {
        cssInjector.processNewElement(element);
      });
    });
  });
} else {
  cssInjector.init().then(() => {
    cssInjector.observeDOM();

    document.querySelectorAll('*').forEach(element => {
      cssInjector.processNewElement(element);
    });
  });
}


let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, reinitializing CSS injector');
    cssInjector.init();
  }
}).observe(document, { subtree: true, childList: true });


(() => {

  Object.defineProperty(window, 'zenblock', {
    value: undefined,
    writable: true
  });
  

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
  

  setTimeout(() => clearInterval(scriptDetector), 10000);
})();

console.log('ZenBlock content script loaded');
