/* FloodTwin AI — Bootstrap Module
   Loads all AI modules and initializes the AI subsystem.
   Include this AFTER all other FT modules are loaded.
*/

(function() {
  "use strict";

  // Wait for FT namespace to be ready
  function waitForFT(callback, maxAttempts = 50) {
    let attempts = 0;

    function check() {
      if (window.FT && window.FT.hydro && window.FT.data) {
        callback();
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(check, 100);
      } else {
        console.error('[FloodTwin AI] Timeout waiting for FT namespace');
      }
    }

    check();
  }

  // Load AI modules dynamically
  async function loadAIModules() {
    const modules = [
      './js/ai/ml-hydrology.js',
      './js/ai/data-pipeline.js',
      './js/ai/training.js',
      './js/ai/validation.js',
      './js/ai/data-assimilation.js',
      './js/ai/llm-integration.js',
      './js/ai/risk-engine.js',
      './js/ai/ai-manager.js'
    ];

    for (const src of modules) {
      try {
        await loadScript(src);
        console.log(`[FloodTwin AI] Loaded: ${src}`);
      } catch (e) {
        console.error(`[FloodTwin AI] Failed to load ${src}:`, e);
      }
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Initialize AI after modules are loaded
  async function initAI() {
    console.log('[FloodTwin AI] Starting initialization...');

    // Check if AI is available
    if (!window.FT.AI) {
      console.warn('[FloodTwin AI] AI namespace not found');
      return { success: false, error: 'AI namespace not found' };
    }

    // Initialize AI subsystem
    const result = await window.FT.AI.initialize({
      features: { ...window.FT.AI.FEATURES }
    });

    // Log status
    console.log('[FloodTwin AI] Initialization result:', result);

    // Add AI status to UI
    addAIStatusToUI(result);

    // Set up auto-update hooks
    setupHooks();

    return result;
  }

  // Add AI status indicator to UI
  function addAIStatusToUI(status) {
    // Create AI status element
    const aiStatus = document.createElement('div');
    aiStatus.id = 'ai-status';
    aiStatus.className = 'ai-status';
    aiStatus.innerHTML = `
      <div class="ai-status-header">
        <span class="ai-status-icon">🤖</span>
        <span class="ai-status-title">FloodTwin AI</span>
        <button class="ai-status-toggle" id="aiToggleBtn" title="Toggle AI Panel">▼</button>
      </div>
      <div class="ai-status-panel" id="aiPanel" style="display: none;">
        <div class="ai-status-item">
          <span>ML Hydrology:</span>
          <span class="ai-badge ai-${status.status.mlHydrology}">${status.status.mlHydrology}</span>
        </div>
        <div class="ai-status-item">
          <span>Data Assimilation:</span>
          <span class="ai-badge ai-${status.status.dataAssimilation}">${status.status.dataAssimilation}</span>
        </div>
        <div class="ai-status-item">
          <span>LLM Advisor:</span>
          <span class="ai-badge ai-${status.status.llm}">${status.status.llm}</span>
        </div>
        <div class="ai-status-item">
          <span>Risk Engine:</span>
          <span class="ai-badge ai-${status.status.riskEngine}">${status.status.riskEngine}</span>
        </div>
        <hr>
        <div class="ai-controls">
          <button id="aiEnableML" class="ai-btn">Enable ML</button>
          <button id="aiEnableLLM" class="ai-btn">Enable LLM</button>
          <button id="aiShowRisk" class="ai-btn">Show Risk</button>
        </div>
        <div id="aiOutput" class="ai-output"></div>
      </div>
    `;

    // Add styles
    addAIStyles();

    // Add to body
    document.body.appendChild(aiStatus);

    // Add event listeners
    document.getElementById('aiToggleBtn').addEventListener('click', () => {
      const panel = document.getElementById('aiPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('aiEnableML').addEventListener('click', async () => {
      const btn = document.getElementById('aiEnableML');
      btn.disabled = true;
      btn.textContent = 'Loading...';

      window.FT.AI.enableFeature('USE_ML_HYDROLOGY', true);
      await initAI();

      btn.textContent = 'ML Enabled';
    });

    document.getElementById('aiEnableLLM').addEventListener('click', async () => {
      window.FT.AI.enableFeature('USE_LLM', true);
      await window.FT.AI.initialize({ features: { USE_LLM: true } });
      document.getElementById('aiEnableLLM').textContent = 'Local template enabled';
    });

    document.getElementById('aiShowRisk').addEventListener('click', async () => {
      const output = document.getElementById('aiOutput');
      output.innerHTML = '<div class="ai-loading">Analyzing risk...</div>';

      try {
        const risk = await window.FT.AI.assessRisk('aiNghia', 48);
        if (risk) {
          output.innerHTML = `
            <div class="ai-risk-result">
              <h4>Risk Assessment: Ái Nghĩa</h4>
              <p><strong>Risk Level:</strong> ${risk.currentRisk?.level || 'N/A'}</p>
              <p><strong>Peak Stage:</strong> ${risk.peakStage?.expected || 'N/A'}m</p>
              <p><strong>P(Alert 3):</strong> ${risk.alertProbabilities?.alert3 || 0}%</p>
              <p><strong>Expected Damage:</strong> ${risk.impacts?.economic?.expected || 'N/A'} M VND</p>
            </div>
          `;
        }
      } catch (e) {
        output.innerHTML = `<div class="ai-error">Error: ${e.message}</div>`;
      }
    });
  }

  // Add AI status styles
  function addAIStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .ai-status {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(6, 18, 29, 0.95);
        border: 1px solid rgba(0, 200, 255, 0.3);
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        z-index: 10000;
        color: #fff;
        font-family: system-ui, -apple-system, sans-serif;
        min-width: 200px;
      }

      .ai-status-header {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      .ai-status-icon {
        font-size: 16px;
      }

      .ai-status-title {
        flex: 1;
        font-weight: 600;
      }

      .ai-status-toggle {
        background: none;
        border: none;
        color: #00c8ff;
        cursor: pointer;
        padding: 0;
        font-size: 10px;
      }

      .ai-status-panel {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .ai-status-item {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
      }

      .ai-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        text-transform: uppercase;
      }

      .ai-ready { background: #22c55e; color: #000; }
      .ai-disabled { background: #666; color: #fff; }
      .ai-not_loaded { background: #f59e0b; color: #000; }
      .ai-error { background: #ef4444; color: #fff; }

      .ai-controls {
        display: flex;
        gap: 5px;
        margin-top: 10px;
      }

      .ai-btn {
        flex: 1;
        padding: 6px 8px;
        background: rgba(0, 200, 255, 0.2);
        border: 1px solid rgba(0, 200, 255, 0.5);
        border-radius: 4px;
        color: #00c8ff;
        cursor: pointer;
        font-size: 10px;
        transition: background 0.2s;
      }

      .ai-btn:hover:not(:disabled) {
        background: rgba(0, 200, 255, 0.4);
      }

      .ai-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .ai-output {
        margin-top: 10px;
        max-height: 200px;
        overflow-y: auto;
      }

      .ai-risk-result {
        background: rgba(0,0,0,0.3);
        padding: 10px;
        border-radius: 4px;
      }

      .ai-risk-result h4 {
        margin: 0 0 8px 0;
        color: #00c8ff;
      }

      .ai-risk-result p {
        margin: 4px 0;
        font-size: 11px;
      }

      .ai-loading {
        color: #888;
        font-style: italic;
      }

      .ai-error {
        color: #ef4444;
      }
    `;
    document.head.appendChild(style);
  }

  // Set up hooks for AI integration
  let hooksInstalled = false;
  function setupHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;
    const FT = window.FT;
    if (!FT || !FT.bus) return;

    // Hook into hydro rebuild to run assimilation
    FT.bus.on('hydroRebuilt', () => {
      console.log('[FloodTwin AI] Hydro rebuilt, checking for ML updates...');

      // Run assimilation cycle if enabled
      if (FT.AI && FT.AI.FEATURES.USE_DATA_ASSIMILATION) {
        const state = FT.AI.runAssimilationCycle(0.25);
        if (state) {
          console.log('[FloodTwin AI] Assimilation update:', state.enkf?.q05?.slice(0, 4));
        }
      }
    });

    // Hook into time updates
    const originalAt = FT.hydro.at;
    FT.hydro.at = function(t, key) {
      const result = originalAt.call(this, t, key);

      // Add AI confidence if enabled
      if (FT.AI && FT.AI.FEATURES.SHOW_AI_CONFIDENCE && FT.AI.FEATURES.USE_DATA_ASSIMILATION) {
        const assimilated = FT.AI.getAssimilatedState();
        if (assimilated) {
          result.aiState = {
            uncertainty: assimilated.discharges?.map((d, i) => ({
              gauge: FT.data.GAUGES[i]?.id,
              q05: assimilated.uncertainty?.q05?.[i],
              q95: assimilated.uncertainty?.q95?.[i]
            })) || []
          };
        }
      }

      return result;
    };

    console.log('[FloodTwin AI] Hooks set up');
  }

  // Auto-initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    await new Promise(resolve => waitForFT(resolve));

    // Load AI modules
    await loadAIModules();

    // Initialize
    const result = await initAI();

    // Log to console
    console.log('%c🤖 FloodTwin AI Ready', 'color: #00c8ff; font-weight: bold; font-size: 14px;');
    console.log('Status:', result);
    console.log('Enable features with: FT.AI.enableFeature("USE_ML_HYDROLOGY", true)');
    console.log('Get risk with: await FT.AI.assessRisk("aiNghia", 48)');
  });

  // Export for manual initialization
  window.FT = window.FT || {};
  window.FT.AIBootstrap = {
    loadModules: loadAIModules,
    init: initAI
  };

})();
