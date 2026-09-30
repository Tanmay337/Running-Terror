/**
 * ArgiFlow™️ // Precision Agro-Hydrology Controller & Optimization Engine
 * Pure ES6+ Modular State-Driven Architecture
 */

// --- Global Sound Synthesizer (Web Audio API) ---
class AudioController {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, vol = 0.08) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playWaterSprinkler() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.08;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 2.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch (e) { }
  }
}

// --- Soil Physics Database ---
const SOIL_PROFILES = {
  clay: {
    name: 'Clay Soil',
    defaultTarget: 36, // % Volumetric Moisture
    wiltingPoint: 22,
    fieldCapacity: 45,
    kMin: 130, // Liters per 1% moisture per 25ha sector
    kMax: 170,
    droughtVulnerability: 0.85,
    desc: 'Dense, high micropore volume. High water retention, slow infiltration.'
  },
  sandy: {
    name: 'Sandy Soil',
    defaultTarget: 18,
    wiltingPoint: 7,
    fieldCapacity: 25,
    kMin: 65,
    kMax: 95,
    droughtVulnerability: 1.45,
    desc: 'Coarse texture, high percolation, rapid drying. Wilts quickly.'
  },
  loamy: {
    name: 'Loamy Soil',
    defaultTarget: 28,
    wiltingPoint: 13,
    fieldCapacity: 35,
    kMin: 95,
    kMax: 135,
    droughtVulnerability: 1.00,
    desc: 'Optimal agronomic mixture of sand, silt, and clay.'
  },
  silt_loam: {
    name: 'Silt Loam',
    defaultTarget: 32,
    wiltingPoint: 15,
    fieldCapacity: 40,
    kMin: 110,
    kMax: 150,
    droughtVulnerability: 0.95,
    desc: 'Smooth, fertile, moderate-high moisture retention.'
  },
  peaty: {
    name: 'Peaty / Organic',
    defaultTarget: 42,
    wiltingPoint: 24,
    fieldCapacity: 55,
    kMin: 140,
    kMax: 190,
    droughtVulnerability: 0.80,
    desc: 'Spongy organic structure with elevated reservoir capacity.'
  }
};

// --- Application Core State ---
class IrrigationControllerApp {
  constructor() {
    this.sound = new AudioController();

    // 4 Equal Quadrants (25 Ha each = 100 Ha total)
    this.regions = [
      {
        id: 1,
        letter: 'A',
        name: 'Sector Alpha',
        quadrant: 'North-West (NW)',
        crop: 'Soybeans',
        soilType: 'clay',
        targetMoisture: 36,
        currentMoisture: 23,
        kFactor: 145,
        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,
        allocationRatio: 1.0,
        isIrrigating: false
      },
      {
        id: 2,
        letter: 'B',
        name: 'Sector Beta',
        quadrant: 'North-East (NE)',
        crop: 'Maize / Corn',
        soilType: 'sandy',
        targetMoisture: 18,
        currentMoisture: 10,
        kFactor: 78,
        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,
        allocationRatio: 1.0,
        isIrrigating: false
      },
      {
        id: 3,
        letter: 'C',
        name: 'Sector Gamma',
        quadrant: 'South-West (SW)',
        crop: 'Winter Wheat',
        soilType: 'loamy',
        targetMoisture: 28,
        currentMoisture: 17,
        kFactor: 112,
        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,
        allocationRatio: 1.0,
        isIrrigating: false
      },
      {
        id: 4,
        letter: 'D',
        name: 'Sector Delta',
        quadrant: 'South-East (SE)',
        crop: 'Sunflowers',
        soilType: 'silt_loam',
        targetMoisture: 32,
        currentMoisture: 21,
        kFactor: 126,
        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,
        allocationRatio: 1.0,
        isIrrigating: false
      }
    ];

    // Weather Conditions
    this.weather = {
      rainForecastMm: 0,
      rainChancePct: 15,
      humidityPct: 32,
      temperatureC: 31,
      preset: 'sunny_dry'
    };

    // Reservoir Storage
    this.reservoir = {
      maxCapacity: 15000,
      waterAvailable: 6000
    };

    this.optimizationStrategy = 'smart_vulnerability';

    this.dispatchStatus = {
      type: 'INSTANT',
      title: 'INSTANT IRRIGATION AUTHORIZED',
      reason: 'Rain forecast is 0mm and humidity is low. Crop root zones require replenishment.',
      waterSaved: 0
    };

    this.isSimulating = false;
  }

  init() {
    this.randomizeAllKFactors(false);
    this.renderQuadrants();
    this.bindEvents();
    this.recomputeAll();
    this.logTelemetry('SYSTEM', 'ArgiFlow Precision Engine started. 4 Equal Area Quadrants (25 Ha each) loaded.');
  }

  generateRandomK(soilType) {
    const profile = SOIL_PROFILES[soilType] || SOIL_PROFILES.loamy;
    const range = profile.kMax - profile.kMin;
    return Math.round(profile.kMin + Math.random() * range);
  }

  randomizeAllKFactors(log = true) {
    this.regions.forEach(region => {
      region.kFactor = this.generateRandomK(region.soilType);
    });
    if (log) {
      this.logTelemetry('SYSTEM', 'Re-rolled hydrology K-factors across all 4 quadrants within soil bulk density parameters.');
      this.sound.playTone(520, 'sine', 0.15);
    }
  }

  bindEvents() {
    // Sound Toggle
    const btnSound = document.getElementById('btn-sound-toggle');
    if (btnSound) {
      const soundOn = document.getElementById('sound-icon-on');
      const soundOff = document.getElementById('sound-icon-off');
      btnSound.addEventListener('click', () => {
        this.sound.enabled = !this.sound.enabled;
        if (soundOn) soundOn.classList.toggle('hidden', !this.sound.enabled);
        if (soundOff) soundOff.classList.toggle('hidden', this.sound.enabled);
      });
    }

    // Quick Randomize
    const btnRand = document.getElementById('btn-quick-randomize');
    if (btnRand) {
      btnRand.addEventListener('click', () => this.randomizeScenario());
    }

    // Re-roll K
    const btnReroll = document.getElementById('btn-reroll-k');
    if (btnReroll) {
      btnReroll.addEventListener('click', () => {
        this.randomizeAllKFactors(true);
        this.renderQuadrants();
        this.recomputeAll();
      });
    }

    // Evaporate Day
    const btnEvaporate = document.getElementById('btn-evaporate-day');
    if (btnEvaporate) {
      btnEvaporate.addEventListener('click', () => {
        this.regions.forEach(reg => {
          reg.currentMoisture = Math.max(2, Math.round((reg.currentMoisture - 4.5) * 10) / 10);
        });
        this.logTelemetry('ACTION', 'Simulated 12h solar evapotranspiration (-4.5% moisture deficit across all zones).');
        this.sound.playTone(330, 'sawtooth', 0.2);
        this.recomputeAll();
      });
    }

    // Execute Irrigation
    const btnRunSim = document.getElementById('btn-run-simulation');
    if (btnRunSim) {
      btnRunSim.addEventListener('click', () => this.executeIrrigationCycle());
    }

    // Weather Sliders
    const sliderRain = document.getElementById('slider-rain');
    if (sliderRain) {
      sliderRain.addEventListener('input', (e) => {
        this.weather.rainForecastMm = parseFloat(e.target.value);
        document.getElementById('val-rain-mm').textContent = `${this.weather.rainForecastMm} mm`;
        const preset = document.getElementById('weather-preset-select');
        if (preset) preset.value = 'custom';
        this.recomputeAll();
      });
    }

    const sliderHumidity = document.getElementById('slider-humidity');
    if (sliderHumidity) {
      sliderHumidity.addEventListener('input', (e) => {
        this.weather.humidityPct = parseFloat(e.target.value);
        document.getElementById('val-humidity').textContent = `${this.weather.humidityPct}%`;
        const preset = document.getElementById('weather-preset-select');
        if (preset) preset.value = 'custom';
        this.recomputeAll();
      });
    }

    const sliderTemp = document.getElementById('slider-temp');
    if (sliderTemp) {
      sliderTemp.addEventListener('input', (e) => {
        this.weather.temperatureC = parseFloat(e.target.value);
        document.getElementById('val-temperature').textContent = `${this.weather.temperatureC} °C`;
        const preset = document.getElementById('weather-preset-select');
        if (preset) preset.value = 'custom';
        this.recomputeAll();
      });
    }

    // Weather Preset Select
    const weatherPresetSelect = document.getElementById('weather-preset-select');
    if (weatherPresetSelect) {
      weatherPresetSelect.addEventListener('change', (e) => {
        this.applyWeatherPreset(e.target.value);
      });
    }

    // Reservoir Slider & Chips
    const sliderReservoir = document.getElementById('slider-reservoir');
    if (sliderReservoir) {
      sliderReservoir.addEventListener('input', (e) => {
        this.reservoir.waterAvailable = parseInt(e.target.value, 10);
        document.getElementById('reservoir-val-text').textContent = this.reservoir.waterAvailable.toLocaleString();
        this.recomputeAll();
      });
    }

    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.val, 10);
        this.reservoir.waterAvailable = val;
        if (sliderReservoir) sliderReservoir.value = val;
        document.getElementById('reservoir-val-text').textContent = val.toLocaleString();
        this.sound.playTone(440, 'sine', 0.1);
        this.recomputeAll();
      });
    });

    // Strategy
    const selectOptStrategy = document.getElementById('select-opt-strategy');
    if (selectOptStrategy) {
      selectOptStrategy.addEventListener('change', (e) => {
        this.optimizationStrategy = e.target.value;
        this.updateOptStrategyDesc();
        this.sound.playTone(490, 'sine', 0.1);
        this.recomputeAll();
      });
    }

    // Clear Logs
    const btnClearLogs = document.getElementById('btn-clear-logs');
    if (btnClearLogs) {
      btnClearLogs.addEventListener('click', () => {
        document.getElementById('terminal-logs-body').innerHTML = `
          <div class="log-entry log-sys">
            <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
            <span class="log-msg">Logs cleared by operator. Precision telemetry active.</span>
          </div>`;
      });
    }
  }

  updateOptStrategyDesc() {
    const descEl = document.getElementById('opt-strategy-desc');
    if (!descEl) return;
    if (this.optimizationStrategy === 'smart_vulnerability') {
      descEl.innerHTML = `<strong>Smart Agronomic Vulnerability:</strong> Rations water by weighting each quadrant's deficit with soil drought vulnerability factor (Sandy soils wilt rapidly &rarr; weight 1.45; Clay holds water longer &rarr; weight 0.85).`;
    } else if (this.optimizationStrategy === 'proportional') {
      descEl.innerHTML = `<strong>Proportional Deficit Rationing:</strong> Allocates water uniformly so every quadrant receives the exact same fraction of its requested water demand.`;
    } else {
      descEl.innerHTML = `<strong>Critical Wilting Triage (Greedy):</strong> Fully satisfies the most moisture-starved and drought-threatened quadrants first until reservoir water runs out.`;
    }
  }

  applyWeatherPreset(presetKey) {
    if (presetKey === 'sunny_dry') {
      this.weather.rainForecastMm = 0;
      this.weather.humidityPct = 26;
      this.weather.temperatureC = 34;
    } else if (presetKey === 'mild_opt') {
      this.weather.rainForecastMm = 0;
      this.weather.humidityPct = 52;
      this.weather.temperatureC = 23;
    } else if (presetKey === 'storm_incoming') {
      this.weather.rainForecastMm = 18;
      this.weather.humidityPct = 91;
      this.weather.temperatureC = 20;
    } else if (presetKey === 'humid_fog') {
      this.weather.rainForecastMm = 1;
      this.weather.humidityPct = 88;
      this.weather.temperatureC = 19;
    } else if (presetKey === 'light_drizzle') {
      this.weather.rainForecastMm = 4;
      this.weather.humidityPct = 82;
      this.weather.temperatureC = 21;
    }

    const setVal = (id, val, text) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
      const txtEl = document.getElementById(text);
      if (txtEl) txtEl.textContent = `${val}${text.includes('temp') ? ' °C' : text.includes('rain') ? ' mm' : '%'}`;
    };

    setVal('slider-rain', this.weather.rainForecastMm, 'val-rain-mm');
    setVal('slider-humidity', this.weather.humidityPct, 'val-humidity');
    setVal('slider-temp', this.weather.temperatureC, 'val-temperature');

    this.logTelemetry('SYSTEM', `Weather preset applied: ${presetKey.toUpperCase()} (Rain: ${this.weather.rainForecastMm}mm, RH: ${this.weather.humidityPct}%)`);
    this.sound.playTone(550, 'sine', 0.12);
    this.recomputeAll();
  }

  recomputeAll() {
    let totalWaterDemand = 0;
    let totalDeficitPct = 0;

    this.regions.forEach(region => {
      region.deficit = Math.max(0, Math.round((region.targetMoisture - region.currentMoisture) * 10) / 10);
      region.waterRequired = Math.round(region.deficit * region.kFactor);
      totalWaterDemand += region.waterRequired;
      totalDeficitPct += region.deficit;
    });

    const avgDeficit = Math.round((totalDeficitPct / 4) * 10) / 10;

    this.evaluateWeatherGating(totalWaterDemand);
    this.optimizeWaterAllocation(totalWaterDemand);

    this.updateHUD(totalWaterDemand, avgDeficit);
    this.updateQuadrantDOM();
    this.updateWeatherBanner();
    this.updateReservoirDOM(totalWaterDemand);
    this.updateAllocationTable(totalWaterDemand);
  }

  evaluateWeatherGating(totalDemand) {
    const rain = this.weather.rainForecastMm;
    const humidity = this.weather.humidityPct;

    if (totalDemand === 0) {
      this.dispatchStatus = {
        type: 'STANDBY',
        title: 'STANDBY // OPTIMAL SOIL MOISTURE',
        reason: 'All 4 quadrants have reached or exceeded target moisture. Irrigation is not required.',
        waterSaved: 0
      };
      return;
    }

    if (rain >= 5) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // PRECIPITATION IMMINENT',
        reason: `Weather forecast predicts ${rain} mm rainfall. Natural precipitation will satisfy moisture deficit, avoiding waterlogging & energy expenditure.`,
        waterSaved: totalDemand
      };
      return;
    }

    if (humidity >= 80 && rain >= 2) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // HIGH HUMIDITY & LIGHT DRIZZLE',
        reason: `Relative humidity is elevated (${humidity}%) and light drizzle (${rain}mm) is active. Transpiration is minimal.`,
        waterSaved: totalDemand
      };
      return;
    }

    if (humidity >= 90) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // ATMOSPHERIC SATURATION',
        reason: `Ambient air is saturated (${humidity}% RH). Soil evaporation is suppressed; postponing cycle to prevent root hypoxia.`,
        waterSaved: totalDemand
      };
      return;
    }

    this.dispatchStatus = {
      type: 'INSTANT',
      title: 'INSTANT IRRIGATION AUTHORIZED',
      reason: `Rain forecast is clear (${rain}mm) and humidity is ${humidity}%. Immediate variable-rate dosing authorized.`,
      waterSaved: 0
    };
  }

  optimizeWaterAllocation(totalDemand) {
    const available = this.reservoir.waterAvailable;

    if (available >= totalDemand || totalDemand === 0) {
      this.regions.forEach(reg => {
        reg.waterAllocated = reg.waterRequired;
        reg.allocationRatio = 1.0;
      });
      return;
    }

    if (this.optimizationStrategy === 'proportional') {
      const scale = available / totalDemand;
      this.regions.forEach(reg => {
        reg.waterAllocated = Math.min(reg.waterRequired, Math.floor(reg.waterRequired * scale));
        reg.allocationRatio = reg.waterRequired > 0 ? (reg.waterAllocated / reg.waterRequired) : 1;
      });
      return;
    }

    if (this.optimizationStrategy === 'triage_critical') {
      const sorted = [...this.regions].sort((a, b) => b.deficit - a.deficit);
      let pool = available;
      this.regions.forEach(r => { r.waterAllocated = 0; });

      sorted.forEach(item => {
        const orig = this.regions.find(r => r.id === item.id);
        if (pool >= orig.waterRequired) {
          orig.waterAllocated = orig.waterRequired;
          pool -= orig.waterRequired;
        } else {
          orig.waterAllocated = pool;
          pool = 0;
        }
        orig.allocationRatio = orig.waterRequired > 0 ? (orig.waterAllocated / orig.waterRequired) : 1;
      });
      return;
    }

    // Default: Smart Agronomic Vulnerability
    let totalWeight = 0;
    const weights = {};

    this.regions.forEach(reg => {
      const soilProf = SOIL_PROFILES[reg.soilType] || SOIL_PROFILES.loamy;
      const w = reg.deficit * soilProf.droughtVulnerability;
      weights[reg.id] = w;
      totalWeight += w;
    });

    if (totalWeight === 0) {
      this.regions.forEach(r => {
        r.waterAllocated = 0;
        r.allocationRatio = 1;
      });
      return;
    }

    let remaining = available;
    let pool = [...this.regions];

    while (pool.length > 0 && remaining > 0) {
      const currentWeight = pool.reduce((acc, r) => acc + weights[r.id], 0);
      if (currentWeight === 0) break;

      let cappedAny = false;
      for (let i = pool.length - 1; i >= 0; i--) {
        const r = pool[i];
        const share = (weights[r.id] / currentWeight) * remaining;
        if (share >= r.waterRequired) {
          r.waterAllocated = r.waterRequired;
          remaining -= r.waterRequired;
          pool.splice(i, 1);
          cappedAny = true;
        }
      }

      if (!cappedAny) {
        pool.forEach(r => {
          r.waterAllocated = Math.min(r.waterRequired, Math.floor((weights[r.id] / currentWeight) * remaining));
        });
        break;
      }
    }

    this.regions.forEach(r => {
      r.allocationRatio = r.waterRequired > 0 ? (r.waterAllocated / r.waterRequired) : 1;
    });
  }

  updateHUD(totalDemand, avgDeficit) {
    const demandEl = document.getElementById('kpi-total-demand');
    if (demandEl) demandEl.textContent = totalDemand.toLocaleString();

    const deficitEl = document.getElementById('kpi-avg-deficit');
    if (deficitEl) deficitEl.textContent = `Avg Deficit: ${avgDeficit.toFixed(1)}%`;

    const reserved = this.reservoir.waterAvailable;
    const reservedEl = document.getElementById('kpi-water-reserved');
    if (reservedEl) reservedEl.textContent = reserved.toLocaleString();

    const ratio = totalDemand > 0 ? Math.round((reserved / totalDemand) * 100) : 100;
    const reserveSubtext = document.getElementById('kpi-reserve-ratio');
    if (reserveSubtext) {
      if (reserved >= totalDemand) {
        reserveSubtext.textContent = `Coverage: ${ratio}% (Surplus)`;
        reserveSubtext.className = 'kpi-subtext text-emerald';
      } else {
        reserveSubtext.textContent = `Coverage: ${ratio}% (Shortage Warning)`;
        reserveSubtext.className = 'kpi-subtext text-rose';
      }
    }

    const badge = document.getElementById('kpi-dispatch-badge');
    const reason = document.getElementById('kpi-dispatch-reason');
    if (badge) {
      badge.textContent = this.dispatchStatus.type;
      if (this.dispatchStatus.type === 'INSTANT') {
        badge.className = 'badge-status badge-instant';
        if (reason) reason.textContent = 'Atmosphere clear; instant dosing';
      } else if (this.dispatchStatus.type === 'DELAYED') {
        badge.className = 'badge-status badge-delayed';
        if (reason) reason.textContent = `Delaying for rain/humidity window`;
      } else {
        badge.className = 'badge-status badge-standby';
        if (reason) reason.textContent = 'Soil moisture saturated';
      }
    }

    const aerialDemand = document.getElementById('aerial-total-water');
    if (aerialDemand) aerialDemand.textContent = `${totalDemand.toLocaleString()} L`;

    const aerialFulfillment = document.getElementById('aerial-fulfillment-pct');
    if (aerialFulfillment) {
      if (totalDemand === 0 || reserved >= totalDemand) {
        aerialFulfillment.textContent = '100% (Balanced)';
        aerialFulfillment.className = 'meta-val text-emerald';
      } else {
        aerialFulfillment.textContent = `${ratio}% (Deficit Rationing)`;
        aerialFulfillment.className = 'meta-val text-amber';
      }
    }
  }

  renderQuadrants() {
    const container = document.getElementById('quadrants-container');
    if (!container) return;
    container.innerHTML = '';

    this.regions.forEach(region => {
      const card = document.createElement('div');
      card.className = `quadrant-card ${region.isIrrigating ? 'irrigating' : ''} ${region.deficit >= 12 ? 'stressed' : ''}`;
      card.id = `quadrant-card-${region.id}`;

      card.innerHTML = `
        <div class="sprinkler-overlay">
          <div class="water-droplets"></div>
        </div>
        <div class="quadrant-top">
          <div class="quadrant-id-group">
            <div class="quadrant-letter">${region.letter}</div>
            <div class="quadrant-title-info">
              <span class="quadrant-name">${region.name} (${region.quadrant})</span>
              <span class="quadrant-area-tag">AREA: 25 HECTARES (EQUAL 25%)</span>
            </div>
          </div>
          <span class="crop-badge">${region.crop}</span>
        </div>

        <div class="soil-config-row">
          <div class="form-group">
            <label class="form-label" for="soil-select-${region.id}">Soil Type</label>
            <select id="soil-select-${region.id}" class="form-select select-sm soil-picker" data-id="${region.id}" aria-label="Soil Type for Region ${region.letter}">
              <option value="clay" ${region.soilType === 'clay' ? 'selected' : ''}>Clay (Target ~36%)</option>
              <option value="sandy" ${region.soilType === 'sandy' ? 'selected' : ''}>Sandy (Target ~18%)</option>
              <option value="loamy" ${region.soilType === 'loamy' ? 'selected' : ''}>Loamy (Target ~28%)</option>
              <option value="silt_loam" ${region.soilType === 'silt_loam' ? 'selected' : ''}>Silt Loam (Target ~32%)</option>
              <option value="peaty" ${region.soilType === 'peaty' ? 'selected' : ''}>Peaty / Org (Target ~42%)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="target-input-${region.id}">
              Target Moisture
              <span class="text-cyan font-mono" id="target-label-${region.id}">${region.targetMoisture}%</span>
            </label>
            <input type="number" id="target-input-${region.id}" min="5" max="55" step="1" value="${region.targetMoisture}" class="form-input select-sm target-num-input" data-id="${region.id}" aria-label="Target Moisture for Region ${region.letter}">
          </div>
        </div>

        <div class="k-pill">
          <span class="k-pill-title">K Coefficient (L/1% &Delta;M):</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="k-pill-val" id="k-val-${region.id}">${region.kFactor} L/%</span>
            <button class="btn btn-xs btn-outline btn-reroll-single" data-id="${region.id}" title="Re-roll K for this region">↺</button>
          </div>
        </div>

        <div class="moisture-block">
          <div class="moisture-header-row">
            <span class="control-label">Current Soil Moisture</span>
            <div class="moisture-readouts">
              <span>Cur: <strong class="val-current" id="cur-val-${region.id}">${region.currentMoisture}%</strong></span>
              <span>Tgt: <span class="val-target" id="tgt-disp-${region.id}">${region.targetMoisture}%</span></span>
            </div>
          </div>

          <div class="moisture-meter-container">
            <div class="moisture-bar-current" id="bar-cur-${region.id}" style="width: ${(region.currentMoisture / 55) * 100}%;"></div>
            <div class="moisture-target-indicator" id="ind-tgt-${region.id}" style="left: ${(region.targetMoisture / 55) * 100}%;" title="Target Moisture Marker"></div>
          </div>

          <input type="range" min="0" max="55" step="0.5" value="${region.currentMoisture}" class="moisture-slider-input" data-id="${region.id}" id="slider-cur-${region.id}" aria-label="Current Moisture Slider Region ${region.letter}">
        </div>

        <div class="quadrant-bottom">
          <div class="stat-item">
            <span class="stat-title">Deficit Moisture:</span>
            <span class="stat-val-deficit" id="deficit-val-${region.id}">${region.deficit}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-title">Water Required:</span>
            <span class="stat-val-water" id="water-req-${region.id}">${region.waterRequired.toLocaleString()} L</span>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    this.bindQuadrantInputs();
  }

  bindQuadrantInputs() {
    document.querySelectorAll('.soil-picker').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const region = this.regions.find(r => r.id === id);
        region.soilType = e.target.value;

        const prof = SOIL_PROFILES[region.soilType];
        region.targetMoisture = prof.defaultTarget;
        region.kFactor = this.generateRandomK(region.soilType);

        const targetInput = document.getElementById(`target-input-${id}`);
        if (targetInput) targetInput.value = region.targetMoisture;
        const targetLabel = document.getElementById(`target-label-${id}`);
        if (targetLabel) targetLabel.textContent = `${region.targetMoisture}%`;
        const tgtDisp = document.getElementById(`tgt-disp-${id}`);
        if (tgtDisp) tgtDisp.textContent = `${region.targetMoisture}%`;
        const kVal = document.getElementById(`k-val-${id}`);
        if (kVal) kVal.textContent = `${region.kFactor} L/%`;

        this.logTelemetry('ACTION', `${region.name} updated to ${prof.name}. Target set to ${prof.defaultTarget}%, K-factor randomized to ${region.kFactor} L/%.`);
        this.sound.playTone(480, 'sine', 0.1);
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.target-num-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = parseFloat(e.target.value) || 0;
        const region = this.regions.find(r => r.id === id);
        region.targetMoisture = Math.max(0, Math.min(55, val));

        const targetLabel = document.getElementById(`target-label-${id}`);
        if (targetLabel) targetLabel.textContent = `${region.targetMoisture}%`;
        const tgtDisp = document.getElementById(`tgt-disp-${id}`);
        if (tgtDisp) tgtDisp.textContent = `${region.targetMoisture}%`;
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.moisture-slider-input').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = parseFloat(e.target.value) || 0;
        const region = this.regions.find(r => r.id === id);
        region.currentMoisture = val;
        const curVal = document.getElementById(`cur-val-${id}`);
        if (curVal) curVal.textContent = `${val.toFixed(1)}%`;
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.btn-reroll-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.target.dataset.id, 10);
        const region = this.regions.find(r => r.id === id);
        region.kFactor = this.generateRandomK(region.soilType);
        const kVal = document.getElementById(`k-val-${id}`);
        if (kVal) kVal.textContent = `${region.kFactor} L/%`;
        this.logTelemetry('ACTION', `Calibrated K-factor for ${region.name} to ${region.kFactor} L/%.`);
        this.sound.playTone(600, 'sine', 0.1);
        this.recomputeAll();
      });
    });
  }

  updateQuadrantDOM() {
    this.regions.forEach(region => {
      const card = document.getElementById(`quadrant-card-${region.id}`);
      if (!card) return;

      const deficitEl = document.getElementById(`deficit-val-${region.id}`);
      if (deficitEl) {
        if (region.deficit === 0) {
          deficitEl.className = 'stat-val-deficit zero';
          deficitEl.textContent = '0.0% (Optimal)';
        } else {
          deficitEl.className = 'stat-val-deficit';
          deficitEl.textContent = `${region.deficit.toFixed(1)}%`;
        }
      }

      const waterEl = document.getElementById(`water-req-${region.id}`);
      if (waterEl) {
        waterEl.textContent = `${region.waterRequired.toLocaleString()} L`;
      }

      const barCur = document.getElementById(`bar-cur-${region.id}`);
      if (barCur) {
        barCur.style.width = `${Math.min(100, (region.currentMoisture / 55) * 100)}%`;
      }

      const indTgt = document.getElementById(`ind-tgt-${region.id}`);
      if (indTgt) {
        indTgt.style.left = `${Math.min(100, (region.targetMoisture / 55) * 100)}%`;
      }

      // Activate or deactivate droplet animation overlay
      if (region.isIrrigating) {
        card.classList.add('irrigating');
      } else {
        card.classList.remove('irrigating');
      }

      if (region.deficit >= 12) {
        card.classList.add('stressed');
      } else {
        card.classList.remove('stressed');
      }
    });
  }

  updateWeatherBanner() {
    const card = document.getElementById('weather-decision-card');
    const title = document.getElementById('decision-title');
    const desc = document.getElementById('decision-desc');
    const badge = document.getElementById('decision-badge');
    const icon = document.getElementById('decision-status-icon');

    const rainGate = document.getElementById('dec-rain-gate');
    const humidGate = document.getElementById('dec-humid-gate');
    const savings = document.getElementById('dec-savings');

    if (!card || !title) return;

    card.className = 'weather-decision-banner';

    if (this.dispatchStatus.type === 'INSTANT') {
      title.textContent = this.dispatchStatus.title;
      desc.textContent = this.dispatchStatus.reason;
      badge.textContent = 'INSTANT';
      badge.className = 'badge-status badge-instant';
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
      if (rainGate) {
        rainGate.textContent = `Clear (${this.weather.rainForecastMm}mm)`;
        rainGate.className = 'dec-val text-emerald';
      }
      if (humidGate) {
        humidGate.textContent = `Active (${this.weather.humidityPct}%)`;
        humidGate.className = 'dec-val text-emerald';
      }
      if (savings) {
        savings.textContent = '0 L (Dosing)';
        savings.className = 'dec-val text-cyan';
      }
    } else if (this.dispatchStatus.type === 'DELAYED') {
      card.classList.add('delayed-active');
      title.textContent = this.dispatchStatus.title;
      desc.textContent = this.dispatchStatus.reason;
      badge.textContent = 'DELAYED';
      badge.className = 'badge-status badge-delayed';
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>`;
      if (rainGate) {
        rainGate.textContent = `Gated (${this.weather.rainForecastMm}mm >= 5mm)`;
        rainGate.className = 'dec-val text-amber';
      }
      if (humidGate) {
        humidGate.textContent = `${this.weather.humidityPct}% RH`;
        humidGate.className = this.weather.humidityPct >= 80 ? 'dec-val text-amber' : 'dec-val text-emerald';
      }
      if (savings) {
        savings.textContent = `${this.dispatchStatus.waterSaved.toLocaleString()} L Saved`;
        savings.className = 'dec-val text-emerald';
      }
    } else {
      card.classList.add('standby-active');
      title.textContent = this.dispatchStatus.title;
      desc.textContent = this.dispatchStatus.reason;
      badge.textContent = 'STANDBY';
      badge.className = 'badge-status badge-standby';
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>`;
      if (rainGate) rainGate.textContent = 'Optimal Moisture';
      if (humidGate) humidGate.textContent = 'Passive';
      if (savings) savings.textContent = '0 L';
    }
  }

  updateReservoirDOM(totalDemand) {
    const available = this.reservoir.waterAvailable;
    const max = this.reservoir.maxCapacity;

    const fillBar = document.getElementById('tank-fill-bar');
    const demandMarker = document.getElementById('tank-demand-marker');
    const badge = document.getElementById('shortage-status-badge');

    if (fillBar) fillBar.style.width = `${Math.min(100, (available / max) * 100)}%`;
    if (demandMarker) {
      const demandPct = Math.min(100, (totalDemand / max) * 100);
      demandMarker.style.left = `${demandPct}%`;
      demandMarker.title = `Water Required: ${totalDemand.toLocaleString()} L (${demandPct.toFixed(1)}%)`;
    }

    if (badge) {
      if (available >= totalDemand) {
        const surplus = available - totalDemand;
        badge.textContent = `SURPLUS BUFFER (+${surplus.toLocaleString()} L)`;
        badge.className = 'badge-status badge-balanced';
      } else {
        const shortage = totalDemand - available;
        badge.textContent = `SHORTAGE DEFICIT (-${shortage.toLocaleString()} L)`;
        badge.className = 'badge-status badge-deficit';
      }
    }
  }

  updateAllocationTable(totalDemand) {
    const tbody = document.getElementById('allocation-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalAllocated = 0;

    this.regions.forEach(r => {
      totalAllocated += r.waterAllocated;
      const covPct = r.waterRequired > 0 ? Math.round((r.waterAllocated / r.waterRequired) * 100) : 100;
      const soilProf = SOIL_PROFILES[r.soilType];

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <strong>${r.letter}</strong> - ${r.name}
          <div class="text-dim font-mono">${r.crop}</div>
        </td>
        <td>
          ${soilProf.name}
          <div class="text-cyan font-mono">${r.kFactor} L/%</div>
        </td>
        <td class="font-mono ${r.deficit === 0 ? 'text-emerald' : 'text-amber'}">
          ${r.deficit.toFixed(1)}%
        </td>
        <td class="font-mono text-cyan">
          ${r.waterRequired.toLocaleString()} L
        </td>
        <td class="font-mono ${covPct < 100 ? 'text-amber' : 'text-emerald'}">
          <strong>${r.waterAllocated.toLocaleString()} L</strong>
        </td>
        <td>
          <div class="opt-prog-wrap">
            <div class="opt-prog-bar">
              <div class="opt-prog-fill ${covPct < 100 ? 'short' : ''}" style="width: ${covPct}%;"></div>
            </div>
            <span class="opt-prog-pct ${covPct < 100 ? 'text-amber' : 'text-emerald'}">${covPct}%</span>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    const unmet = Math.max(0, totalDemand - totalAllocated);
    const sumDemanded = document.getElementById('sum-demanded');
    if (sumDemanded) sumDemanded.textContent = `${totalDemand.toLocaleString()} L`;
    const sumAllocated = document.getElementById('sum-allocated');
    if (sumAllocated) sumAllocated.textContent = `${totalAllocated.toLocaleString()} L`;
    const sumUnmet = document.getElementById('sum-unmet');
    if (sumUnmet) sumUnmet.textContent = `${unmet.toLocaleString()} L`;
  }

  executeIrrigationCycle() {
    if (this.isSimulating) return;

    if (this.dispatchStatus.type === 'DELAYED') {
      this.logTelemetry('WARN', `Irrigation cycle prevented: Weather gating is DELAYED.`);
      this.sound.playTone(220, 'sawtooth', 0.25);
      alert(`[AGRIFLOW ADVISORY]\nIrrigation is currently DELAYED by the Weather Gating Engine.\n\nReason: ${this.dispatchStatus.reason}\n\nProjected Water Conserved: ${this.dispatchStatus.waterSaved.toLocaleString()} Liters.`);
      return;
    }

    const totalDemand = this.regions.reduce((acc, r) => acc + r.waterRequired, 0);
    if (totalDemand === 0) {
      this.logTelemetry('SYSTEM', 'Irrigation cycle unnecessary: All quadrants have reached optimal moisture.');
      this.sound.playTone(440, 'sine', 0.15);
      return;
    }

    this.isSimulating = true;
    const btn = document.getElementById('btn-run-simulation');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `Irrigating Quadrants...`;
    }

    // Freeze allocations for the current animation cycle
    const targetAllocations = this.regions.map(r => r.waterAllocated);
    const totalToDisperse = targetAllocations.reduce((a, b) => a + b, 0);
    const reservoirStart = this.reservoir.waterAvailable;

    // Trigger visual sprinkler & droplet layer on active quadrants
    this.regions.forEach((r, idx) => {
      r.isIrrigating = targetAllocations[idx] > 0;
    });
    this.updateQuadrantDOM();

    this.logTelemetry('ACTION', `Valve arrays activated. Dispersing ${totalToDisperse.toLocaleString()} L across field zones...`);
    this.sound.playWaterSprinkler();

    const steps = 25;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const fraction = 1 / steps;

      this.regions.forEach((r, idx) => {
        if (targetAllocations[idx] > 0) {
          const lift = (targetAllocations[idx] / r.kFactor) * fraction;
          r.currentMoisture = Math.min(r.targetMoisture, Math.round((r.currentMoisture + lift) * 10) / 10);
        }
      });

      this.reservoir.waterAvailable = Math.max(0, Math.round(reservoirStart - (totalToDisperse * (step / steps))));
      const resSlider = document.getElementById('slider-reservoir');
      if (resSlider) resSlider.value = this.reservoir.waterAvailable;
      const resText = document.getElementById('reservoir-val-text');
      if (resText) resText.textContent = this.reservoir.waterAvailable.toLocaleString();

      this.updateQuadrantDOM();

      if (step >= steps) {
        clearInterval(interval);
        // Turn off droplet overlays
        this.regions.forEach(r => { r.isIrrigating = false; });
        this.isSimulating = false;
        this.recomputeAll();

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Execute Irrigation Cycle
          `;
        }

        this.logTelemetry('ACTION', `Irrigation cycle complete. Reservoir: ${this.reservoir.waterAvailable.toLocaleString()} L.`);
        this.sound.playTone(880, 'sine', 0.25);
      }
    }, 100);
  }

  randomizeScenario() {
    const soilKeys = Object.keys(SOIL_PROFILES);
    this.regions.forEach(r => {
      r.soilType = soilKeys[Math.floor(Math.random() * soilKeys.length)];
      const prof = SOIL_PROFILES[r.soilType];
      r.targetMoisture = prof.defaultTarget;
      r.kFactor = this.generateRandomK(r.soilType);
      r.currentMoisture = Math.max(4, Math.round((prof.wiltingPoint + Math.random() * (prof.defaultTarget - prof.wiltingPoint)) * 10) / 10);
    });

    const weatherModes = ['sunny_dry', 'mild_opt', 'storm_incoming', 'light_drizzle'];
    const chosenMode = weatherModes[Math.floor(Math.random() * weatherModes.length)];
    this.applyWeatherPreset(chosenMode);
    const weatherPresetSelect = document.getElementById('weather-preset-select');
    if (weatherPresetSelect) weatherPresetSelect.value = chosenMode;

    const possibleReservoirs = [2500, 4500, 7500, 11000];
    const res = possibleReservoirs[Math.floor(Math.random() * possibleReservoirs.length)];
    this.reservoir.waterAvailable = res;
    const resSlider = document.getElementById('slider-reservoir');
    if (resSlider) resSlider.value = res;
    const resText = document.getElementById('reservoir-val-text');
    if (resText) resText.textContent = res.toLocaleString();

    this.renderQuadrants();
    this.recomputeAll();
    this.logTelemetry('SYSTEM', 'Generated dynamic test scenario.');
    this.sound.playTone(660, 'sine', 0.15);
  }

  logTelemetry(type, message) {
    const body = document.getElementById('terminal-logs-body');
    if (!body) return;

    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type.toLowerCase()}`;
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-msg">${message}</span>
    `;

    body.appendChild(entry);
    body.scrollTop = body.scrollHeight;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.argiFlow = new IrrigationControllerApp();
  window.agriFlow = window.argiFlow;
  window.argiFlow.init();
});
