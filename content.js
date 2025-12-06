// ZenBlock Content Script - Element Hiding and CSS Injection
// Handles CSS-based element hiding rules (##selector)

class CSSInjector {
  constructor() {
    this.injectedStyles = new Map();
    this.domain = window.location.hostname;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log(`ZenBlock CSS Injector initialized for ${this.domain}`);
    
    // Get CSS rules from storage
    const cssRules = await this.getCSSRules();
    
    // Inject CSS for current domain
    await this.injectCSSRules(cssRules);
    
    // Set up message listener for dynamic updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateCSS') {
        this.injectCSSRules(message.cssRules || {});
        sendResponse({ success: true });
      }
    });
    
    this.isInitialized = true;
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

  clearExistingStyles() {
    this.injectedStyles.forEach((styleElement, styleId) => {
      if (styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    });
    this.injectedStyles.clear();
  }

  // Handle dynamic content changes
  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldReinject = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new nodes might contain ads
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Look for common ad indicators
              if (node.classList && (
                node.className.includes('ad') ||
                node.className.includes('advertisement') ||
                node.className.includes('sponsored')
              )) {
                shouldReinject = true;
              }
              
              // Check for ad-related IDs
              if (node.id && (
                node.id.includes('ad') ||
                node.id.includes('advertisement') ||
                node.id.includes('sponsored')
              )) {
                shouldReinject = true;
              }
            }
          });
        }
      });
      
      if (shouldReinject) {
        // Reinject CSS rules to catch dynamically loaded ads
        this.init();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize CSS injector
const cssInjector = new CSSInjector();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    cssInjector.init().then(() => {
      cssInjector.observeDOM();
    });
  });
} else {
  cssInjector.init().then(() => {
    cssInjector.observeDOM();
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

// Anti-detection measures
(() => {
  // Prevent ad-block detection scripts from detecting our content script
  const originalQuerySelector = document.querySelector;
  const originalQuerySelectorAll = document.querySelectorAll;
  
  // Override common ad-block detection methods
  Object.defineProperty(document, 'querySelector', {
    value: function(selector) {
      // Block queries looking for ad-block detection elements
      if (selector.includes('adblock') || 
          selector.includes('adb') || 
          selector.includes('blocker')) {
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
          selector.includes('blocker')) {
        return [];
      }
      return originalQuerySelectorAll.call(this, selector);
    }
  });
})();

console.log('ZenBlock content script loaded');
