/**
 * ArgiFlow™️ // Ultra-Optimized Agro-Hydrology Engine
 * High-performance state loop with cached DOM selectors & requestAnimationFrame
 */

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

  playTone(freq, type = 'sine', duration = 0.12, vol = 0.06) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
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
    } catch (e) {}
  }

  playWaterSprinkler() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.25);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.05;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      noise.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch (e) {}
  }
}

const SOIL_PROFILES = {
  clay: { name: 'Clay Soil', defaultTarget: 36, wiltingPoint: 22, kMin: 130, kMax: 170, droughtVulnerability: 0.85 },
  sandy: { name: 'Sandy Soil', defaultTarget: 18, wiltingPoint: 7, kMin: 65, kMax: 95, droughtVulnerability: 1.45 },
  loamy: { name: 'Loamy Soil', defaultTarget: 28, wiltingPoint: 13, kMin: 95, kMax: 135, droughtVulnerability: 1.00 },
  silt_loam: { name: 'Silt Loam', defaultTarget: 32, wiltingPoint: 15, kMin: 110, kMax: 150, droughtVulnerability: 0.95 },
  peaty: { name: 'Peaty / Org', defaultTarget: 42, wiltingPoint: 24, kMin: 140, kMax: 190, droughtVulnerability: 0.80 }
};

class IrrigationControllerApp {
  constructor() {
    this.sound = new AudioController();

    this.regions = [
      { id: 1, letter: 'A', name: 'Sector Alpha', quadrant: 'NW', crop: 'Soybeans', soilType: 'clay', targetMoisture: 36, currentMoisture: 23, kFactor: 145, deficit: 0, waterRequired: 0, waterAllocated: 0, isIrrigating: false },
      { id: 2, letter: 'B', name: 'Sector Beta', quadrant: 'NE', crop: 'Maize / Corn', soilType: 'sandy', targetMoisture: 18, currentMoisture: 10, kFactor: 78, deficit: 0, waterRequired: 0, waterAllocated: 0, isIrrigating: false },
      { id: 3, letter: 'C', name: 'Sector Gamma', quadrant: 'SW', crop: 'Winter Wheat', soilType: 'loamy', targetMoisture: 28, currentMoisture: 17, kFactor: 112, deficit: 0, waterRequired: 0, waterAllocated: 0, isIrrigating: false },
      { id: 4, letter: 'D', name: 'Sector Delta', quadrant: 'SE', crop: 'Sunflowers', soilType: 'silt_loam', targetMoisture: 32, currentMoisture: 21, kFactor: 126, deficit: 0, waterRequired: 0, waterAllocated: 0, isIrrigating: false }
    ];

    this.weather = { rainForecastMm: 0, humidityPct: 32, temperatureC: 31 };
    this.reservoir = { maxCapacity: 15000, waterAvailable: 6000 };
    this.optimizationStrategy = 'smart_vulnerability';
    this.dispatchStatus = { type: 'INSTANT', title: 'INSTANT IRRIGATION AUTHORIZED', reason: '', waterSaved: 0 };
    this.isSimulating = false;

    // DOM Cache Map
    this.dom = {};
  }

  init() {
    this.cacheStaticDOM();
    this.randomizeAllKFactors(false);
    this.renderQuadrantsOnce();
    this.bindEvents();
    this.recomputeAll();
    this.logTelemetry('SYSTEM', 'ArgiFlow Engine active (Optimized Build).');
  }

  cacheStaticDOM() {
    this.dom.totalDemand = document.getElementById('kpi-total-demand');
    this.dom.avgDeficit = document.getElementById('kpi-avg-deficit');
    this.dom.waterReserved = document.getElementById('kpi-water-reserved');
    this.dom.reserveRatio = document.getElementById('kpi-reserve-ratio');
    this.dom.dispatchBadge = document.getElementById('kpi-dispatch-badge');
    this.dom.dispatchReason = document.getElementById('kpi-dispatch-reason');
    this.dom.aerialDemand = document.getElementById('aerial-total-water');
    this.dom.aerialFulfillment = document.getElementById('aerial-fulfillment-pct');

    this.dom.weatherCard = document.getElementById('weather-decision-card');
    this.dom.decisionTitle = document.getElementById('decision-title');
    this.dom.decisionDesc = document.getElementById('decision-desc');
    this.dom.decisionBadge = document.getElementById('decision-badge');
    this.dom.decisionIcon = document.getElementById('decision-status-icon');
    this.dom.decRainGate = document.getElementById('dec-rain-gate');
    this.dom.decHumidGate = document.getElementById('dec-humid-gate');
    this.dom.decSavings = document.getElementById('dec-savings');

    this.dom.tankFillBar = document.getElementById('tank-fill-bar');
    this.dom.tankDemandMarker = document.getElementById('tank-demand-marker');
    this.dom.shortageBadge = document.getElementById('shortage-status-badge');
    this.dom.sliderReservoir = document.getElementById('slider-reservoir');
    this.dom.reservoirValText = document.getElementById('reservoir-val-text');

    this.dom.allocTableBody = document.getElementById('allocation-table-body');
    this.dom.sumDemanded = document.getElementById('sum-demanded');
    this.dom.sumAllocated = document.getElementById('sum-allocated');
    this.dom.sumUnmet = document.getElementById('sum-unmet');
    this.dom.logsBody = document.getElementById('terminal-logs-body');
  }

  generateRandomK(soilType) {
    const prof = SOIL_PROFILES[soilType] || SOIL_PROFILES.loamy;
    return Math.round(prof.kMin + Math.random() * (prof.kMax - prof.kMin));
  }

  randomizeAllKFactors(log = true) {
    this.regions.forEach(r => { r.kFactor = this.generateRandomK(r.soilType); });
    if (log) {
      this.regions.forEach(r => {
        if (this.dom[`kVal_${r.id}`]) this.dom[`kVal_${r.id}`].textContent = `${r.kFactor} L/%`;
      });
      this.logTelemetry('SYSTEM', 'Hydrology K-factors re-calibrated.');
      this.sound.playTone(520, 'sine', 0.1);
    }
  }

  bindEvents() {
    const soundToggle = document.getElementById('btn-sound-toggle');
    if (soundToggle) {
      const sOn = document.getElementById('sound-icon-on');
      const sOff = document.getElementById('sound-icon-off');
      soundToggle.addEventListener('click', () => {
        this.sound.enabled = !this.sound.enabled;
        sOn.classList.toggle('hidden', !this.sound.enabled);
        sOff.classList.toggle('hidden', this.sound.enabled);
      });
    }

    document.getElementById('btn-quick-randomize')?.addEventListener('click', () => this.randomizeScenario());

    document.getElementById('btn-reroll-k')?.addEventListener('click', () => {
      this.randomizeAllKFactors(true);
      this.recomputeAll();
    });

    document.getElementById('btn-evaporate-day')?.addEventListener('click', () => {
      this.regions.forEach(reg => {
        reg.currentMoisture = Math.max(2, Math.round((reg.currentMoisture - 4.5) * 10) / 10);
      });
      this.logTelemetry('ACTION', 'Evapotranspiration applied (-4.5% moisture).');
      this.sound.playTone(330, 'sawtooth', 0.15);
      this.recomputeAll();
    });

    document.getElementById('btn-run-simulation')?.addEventListener('click', () => this.executeIrrigationCycle());

    document.getElementById('slider-rain')?.addEventListener('input', (e) => {
      this.weather.rainForecastMm = parseFloat(e.target.value);
      document.getElementById('val-rain-mm').textContent = `${this.weather.rainForecastMm} mm`;
      document.getElementById('weather-preset-select').value = 'custom';
      this.recomputeAll();
    });

    document.getElementById('slider-humidity')?.addEventListener('input', (e) => {
      this.weather.humidityPct = parseFloat(e.target.value);
      document.getElementById('val-humidity').textContent = `${this.weather.humidityPct}%`;
      document.getElementById('weather-preset-select').value = 'custom';
      this.recomputeAll();
    });

    document.getElementById('slider-temp')?.addEventListener('input', (e) => {
      this.weather.temperatureC = parseFloat(e.target.value);
      document.getElementById('val-temperature').textContent = `${this.weather.temperatureC} °C`;
      document.getElementById('weather-preset-select').value = 'custom';
      this.recomputeAll();
    });

    document.getElementById('weather-preset-select')?.addEventListener('change', (e) => this.applyWeatherPreset(e.target.value));

    this.dom.sliderReservoir?.addEventListener('input', (e) => {
      this.reservoir.waterAvailable = parseInt(e.target.value, 10);
      this.dom.reservoirValText.textContent = this.reservoir.waterAvailable.toLocaleString();
      this.recomputeAll();
    });

    document.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.val, 10);
        this.reservoir.waterAvailable = val;
        if (this.dom.sliderReservoir) this.dom.sliderReservoir.value = val;
        this.dom.reservoirValText.textContent = val.toLocaleString();
        this.sound.playTone(440, 'sine', 0.08);
        this.recomputeAll();
      });
    });

    document.getElementById('select-opt-strategy')?.addEventListener('change', (e) => {
      this.optimizationStrategy = e.target.value;
      const desc = document.getElementById('opt-strategy-desc');
      if (desc) {
        if (this.optimizationStrategy === 'smart_vulnerability') desc.innerHTML = '<strong>Smart Vulnerability:</strong> Rations water by weighting root-zone deficit with soil drought vulnerability multiplier.';
        else if (this.optimizationStrategy === 'proportional') desc.innerHTML = '<strong>Proportional Deficit Rationing:</strong> Uniform scaled allocation across all quadrants.';
        else desc.innerHTML = '<strong>Wilting Triage:</strong> Satisfies highest-deficit zones completely until reservoir exhausts.';
      }
      this.sound.playTone(490, 'sine', 0.08);
      this.recomputeAll();
    });

    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      if (this.dom.logsBody) {
        this.dom.logsBody.innerHTML = `
          <div class="log-entry log-sys">
            <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
            <span class="log-msg">Logs cleared. Real-time telemetry monitoring.</span>
          </div>`;
      }
    });
  }

  applyWeatherPreset(presetKey) {
    if (presetKey === 'sunny_dry') { this.weather.rainForecastMm = 0; this.weather.humidityPct = 26; this.weather.temperatureC = 34; }
    else if (presetKey === 'mild_opt') { this.weather.rainForecastMm = 0; this.weather.humidityPct = 52; this.weather.temperatureC = 23; }
    else if (presetKey === 'storm_incoming') { this.weather.rainForecastMm = 18; this.weather.humidityPct = 91; this.weather.temperatureC = 20; }
    else if (presetKey === 'humid_fog') { this.weather.rainForecastMm = 1; this.weather.humidityPct = 88; this.weather.temperatureC = 19; }
    else if (presetKey === 'light_drizzle') { this.weather.rainForecastMm = 4; this.weather.humidityPct = 82; this.weather.temperatureC = 21; }

    const rSlider = document.getElementById('slider-rain');
    if (rSlider) rSlider.value = this.weather.rainForecastMm;
    const hSlider = document.getElementById('slider-humidity');
    if (hSlider) hSlider.value = this.weather.humidityPct;
    const tSlider = document.getElementById('slider-temp');
    if (tSlider) tSlider.value = this.weather.temperatureC;

    document.getElementById('val-rain-mm').textContent = `${this.weather.rainForecastMm} mm`;
    document.getElementById('val-humidity').textContent = `${this.weather.humidityPct}%`;
    document.getElementById('val-temperature').textContent = `${this.weather.temperatureC} °C`;

    this.recomputeAll();
  }

  renderQuadrantsOnce() {
    const container = document.getElementById('quadrants-container');
    if (!container) return;
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();

    this.regions.forEach(region => {
      const card = document.createElement('div');
      card.className = 'quadrant-card';
      card.id = `quadrant-card-${region.id}`;

      card.innerHTML = `
        <div class="sprinkler-overlay" id="sprinkler-${region.id}">
          <div class="water-droplets"></div>
        </div>
        <div class="quadrant-top">
          <div class="quadrant-id-group">
            <div class="quadrant-letter">${region.letter}</div>
            <div class="quadrant-title-info">
              <span class="quadrant-name">${region.name} (${region.quadrant})</span>
              <span class="quadrant-area-tag">AREA: 25 HA (EQUAL 25%)</span>
            </div>
          </div>
          <span class="crop-badge">${region.crop}</span>
        </div>

        <div class="soil-config-row">
          <div class="form-group">
            <label class="form-label" for="soil-select-${region.id}">Soil Type</label>
            <select id="soil-select-${region.id}" class="form-select select-sm soil-picker" data-id="${region.id}">
              <option value="clay" ${region.soilType === 'clay' ? 'selected' : ''}>Clay (~36%)</option>
              <option value="sandy" ${region.soilType === 'sandy' ? 'selected' : ''}>Sandy (~18%)</option>
              <option value="loamy" ${region.soilType === 'loamy' ? 'selected' : ''}>Loamy (~28%)</option>
              <option value="silt_loam" ${region.soilType === 'silt_loam' ? 'selected' : ''}>Silt Loam (~32%)</option>
              <option value="peaty" ${region.soilType === 'peaty' ? 'selected' : ''}>Peaty (~42%)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="target-input-${region.id}">
              Target
              <span class="text-cyan font-mono" id="target-label-${region.id}">${region.targetMoisture}%</span>
            </label>
            <input type="number" id="target-input-${region.id}" min="5" max="55" step="1" value="${region.targetMoisture}" class="form-input select-sm target-num-input" data-id="${region.id}">
          </div>
        </div>

        <div class="k-pill">
          <span class="k-pill-title">K (L/1% &Delta;M):</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="k-pill-val" id="k-val-${region.id}">${region.kFactor} L/%</span>
            <button class="btn btn-xs btn-outline btn-reroll-single" data-id="${region.id}" title="Re-roll K">↺</button>
          </div>
        </div>

        <div class="moisture-block">
          <div class="moisture-header-row">
            <span class="control-label">Moisture</span>
            <div class="moisture-readouts">
              <span>Cur: <strong class="val-current" id="cur-val-${region.id}">${region.currentMoisture}%</strong></span>
              <span>Tgt: <span class="val-target" id="tgt-disp-${region.id}">${region.targetMoisture}%</span></span>
            </div>
          </div>

          <div class="moisture-meter-container">
            <div class="moisture-bar-current" id="bar-cur-${region.id}"></div>
            <div class="moisture-target-indicator" id="ind-tgt-${region.id}"></div>
          </div>

          <input type="range" min="0" max="55" step="0.5" value="${region.currentMoisture}" class="moisture-slider-input" data-id="${region.id}" id="slider-cur-${region.id}">
        </div>

        <div class="quadrant-bottom">
          <div class="stat-item">
            <span class="stat-title">Deficit:</span>
            <span class="stat-val-deficit" id="deficit-val-${region.id}">0.0%</span>
          </div>
          <div class="stat-item">
            <span class="stat-title">Required:</span>
            <span class="stat-val-water" id="water-req-${region.id}">0 L</span>
          </div>
        </div>
      `;
      fragment.appendChild(card);
    });

    container.appendChild(fragment);

    // Cache dynamic elements once
    this.regions.forEach(r => {
      this.dom[`card_${r.id}`] = document.getElementById(`quadrant-card-${r.id}`);
      this.dom[`curVal_${r.id}`] = document.getElementById(`cur-val-${r.id}`);
      this.dom[`tgtDisp_${r.id}`] = document.getElementById(`tgt-disp-${r.id}`);
      this.dom[`tgtLabel_${r.id}`] = document.getElementById(`target-label-${r.id}`);
      this.dom[`tgtInput_${r.id}`] = document.getElementById(`target-input-${r.id}`);
      this.dom[`kVal_${r.id}`] = document.getElementById(`k-val-${r.id}`);
      this.dom[`barCur_${r.id}`] = document.getElementById(`bar-cur-${r.id}`);
      this.dom[`indTgt_${r.id}`] = document.getElementById(`ind-tgt-${r.id}`);
      this.dom[`deficitVal_${r.id}`] = document.getElementById(`deficit-val-${r.id}`);
      this.dom[`waterReq_${r.id}`] = document.getElementById(`water-req-${r.id}`);
      this.dom[`sliderCur_${r.id}`] = document.getElementById(`slider-cur-${r.id}`);
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

        this.dom[`tgtInput_${id}`].value = region.targetMoisture;
        this.dom[`tgtLabel_${id}`].textContent = `${region.targetMoisture}%`;
        this.dom[`tgtDisp_${id}`].textContent = `${region.targetMoisture}%`;
        this.dom[`kVal_${id}`].textContent = `${region.kFactor} L/%`;

        this.recomputeAll();
      });
    });

    document.querySelectorAll('.target-num-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = Math.max(0, Math.min(55, parseFloat(e.target.value) || 0));
        const region = this.regions.find(r => r.id === id);
        region.targetMoisture = val;
        this.dom[`tgtLabel_${id}`].textContent = `${val}%`;
        this.dom[`tgtDisp_${id}`].textContent = `${val}%`;
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.moisture-slider-input').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = parseFloat(e.target.value) || 0;
        const region = this.regions.find(r => r.id === id);
        region.currentMoisture = val;
        this.dom[`curVal_${id}`].textContent = `${val.toFixed(1)}%`;
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.btn-reroll-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.target.dataset.id, 10);
        const region = this.regions.find(r => r.id === id);
        region.kFactor = this.generateRandomK(region.soilType);
        this.dom[`kVal_${id}`].textContent = `${region.kFactor} L/%`;
        this.recomputeAll();
      });
    });
  }

  recomputeAll() {
    let totalDemand = 0;
    let totalDeficit = 0;

    for (let i = 0; i < 4; i++) {
      const r = this.regions[i];
      r.deficit = Math.max(0, Math.round((r.targetMoisture - r.currentMoisture) * 10) / 10);
      r.waterRequired = Math.round(r.deficit * r.kFactor);
      totalDemand += r.waterRequired;
      totalDeficit += r.deficit;
    }

    const avgDeficit = (totalDeficit / 4).toFixed(1);
    this.evaluateWeather(totalDemand);
    this.optimizeAllocation(totalDemand);
    this.renderFastDOM(totalDemand, avgDeficit);
  }

  evaluateWeather(totalDemand) {
    const rain = this.weather.rainForecastMm;
    const hum = this.weather.humidityPct;

    if (totalDemand === 0) {
      this.dispatchStatus = { type: 'STANDBY', title: 'STANDBY // OPTIMAL MOISTURE', reason: 'Field moisture is at capacity.', waterSaved: 0 };
    } else if (rain >= 5) {
      this.dispatchStatus = { type: 'DELAYED', title: 'IRRIGATION DELAYED // RAIN PREDICTED', reason: `Forecast indicates ${rain}mm precipitation. Preserving reservoir water.`, waterSaved: totalDemand };
    } else if (hum >= 80 && rain >= 2) {
      this.dispatchStatus = { type: 'DELAYED', title: 'IRRIGATION DELAYED // HUMID + DRIZZLE', reason: `High humidity (${hum}%) and passing drizzle minimizes plant transpiration.`, waterSaved: totalDemand };
    } else {
      this.dispatchStatus = { type: 'INSTANT', title: 'INSTANT IRRIGATION AUTHORIZED', reason: `Clear conditions (${rain}mm rain, ${hum}% RH). Water deficit active.`, waterSaved: 0 };
    }
  }

  optimizeAllocation(totalDemand) {
    const avail = this.reservoir.waterAvailable;

    if (avail >= totalDemand || totalDemand === 0) {
      this.regions.forEach(r => { r.waterAllocated = r.waterRequired; });
      return;
    }

    if (this.optimizationStrategy === 'proportional') {
      const scale = avail / totalDemand;
      this.regions.forEach(r => { r.waterAllocated = Math.floor(r.waterRequired * scale); });
      return;
    }

    if (this.optimizationStrategy === 'triage_critical') {
      const sorted = [...this.regions].sort((a, b) => b.deficit - a.deficit);
      let pool = avail;
      this.regions.forEach(r => { r.waterAllocated = 0; });
      sorted.forEach(s => {
        const r = this.regions.find(x => x.id === s.id);
        const take = Math.min(pool, r.waterRequired);
        r.waterAllocated = take;
        pool -= take;
      });
      return;
    }

    // Default: Smart Agronomic Vulnerability
    let totalWeight = 0;
    const weights = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const r = this.regions[i];
      const prof = SOIL_PROFILES[r.soilType];
      const w = r.deficit * prof.droughtVulnerability;
      weights[i] = w;
      totalWeight += w;
    }

    if (totalWeight === 0) {
      this.regions.forEach(r => { r.waterAllocated = 0; });
      return;
    }

    for (let i = 0; i < 4; i++) {
      this.regions[i].waterAllocated = Math.min(this.regions[i].waterRequired, Math.floor((weights[i] / totalWeight) * avail));
    }
  }

  renderFastDOM(totalDemand, avgDeficit) {
    // Top HUD
    this.dom.totalDemand.textContent = totalDemand.toLocaleString();
    this.dom.avgDeficit.textContent = `Avg Deficit: ${avgDeficit}%`;
    const avail = this.reservoir.waterAvailable;
    this.dom.waterReserved.textContent = avail.toLocaleString();

    const cov = totalDemand > 0 ? Math.round((avail / totalDemand) * 100) : 100;
    this.dom.reserveRatio.textContent = `Coverage: ${cov}%`;
    this.dom.dispatchBadge.textContent = this.dispatchStatus.type;
    this.dom.dispatchBadge.className = `badge-status badge-${this.dispatchStatus.type.toLowerCase()}`;
    this.dom.dispatchReason.textContent = this.dispatchStatus.type === 'INSTANT' ? 'Clear atmospheric window' : 'Weather gate active';

    // Aerial
    this.dom.aerialDemand.textContent = `${totalDemand.toLocaleString()} L`;
    this.dom.aerialFulfillment.textContent = `${cov}%`;

    // Quadrants (Using scaleX transform to avoid reflow)
    for (let i = 0; i < 4; i++) {
      const r = this.regions[i];
      const curRatio = Math.min(1, r.currentMoisture / 55);
      const tgtRatio = Math.min(1, r.targetMoisture / 55);

      this.dom[`barCur_${r.id}`].style.transform = `scaleX(${curRatio})`;
      this.dom[`indTgt_${r.id}`].style.left = `${tgtRatio * 100}%`;
      this.dom[`deficitVal_${r.id}`].textContent = `${r.deficit.toFixed(1)}%`;
      this.dom[`waterReq_${r.id}`].textContent = `${r.waterRequired.toLocaleString()} L`;

      if (r.deficit >= 12) this.dom[`card_${r.id}`].classList.add('stressed');
      else this.dom[`card_${r.id}`].classList.remove('stressed');
    }

    // Weather Banner
    this.dom.decisionTitle.textContent = this.dispatchStatus.title;
    this.dom.decisionDesc.textContent = this.dispatchStatus.reason;
    this.dom.decisionBadge.textContent = this.dispatchStatus.type;
    this.dom.decisionBadge.className = `badge-status badge-${this.dispatchStatus.type.toLowerCase()}`;
    this.dom.weatherCard.className = `weather-decision-banner ${this.dispatchStatus.type === 'DELAYED' ? 'delayed-active' : ''}`;
    this.dom.decRainGate.textContent = `${this.weather.rainForecastMm} mm`;
    this.dom.decHumidGate.textContent = `${this.weather.humidityPct}% RH`;
    this.dom.decSavings.textContent = `${this.dispatchStatus.waterSaved.toLocaleString()} L`;

    // Reservoir Tank (scaleX for instant hardware paint)
    const tankRatio = Math.min(1, avail / this.reservoir.maxCapacity);
    const demandRatio = Math.min(1, totalDemand / this.reservoir.maxCapacity);
    this.dom.tankFillBar.style.transform = `scaleX(${tankRatio})`;
    this.dom.tankDemandMarker.style.left = `${demandRatio * 100}%`;

    if (avail >= totalDemand) {
      this.dom.shortageBadge.textContent = `SURPLUS (+${(avail - totalDemand).toLocaleString()} L)`;
      this.dom.shortageBadge.className = 'badge-status badge-balanced';
    } else {
      this.dom.shortageBadge.textContent = `SHORTAGE (-${(totalDemand - avail).toLocaleString()} L)`;
      this.dom.shortageBadge.className = 'badge-status badge-deficit';
    }

    // Allocation Table
    let allocatedTotal = 0;
    let html = '';
    for (let i = 0; i < 4; i++) {
      const r = this.regions[i];
      allocatedTotal += r.waterAllocated;
      const covPct = r.waterRequired > 0 ? Math.round((r.waterAllocated / r.waterRequired) * 100) : 100;
      html += `
        <tr>
          <td><strong>${r.letter}</strong> - ${r.name}</td>
          <td>${SOIL_PROFILES[r.soilType].name}</td>
          <td>${r.deficit.toFixed(1)}%</td>
          <td>${r.waterRequired.toLocaleString()} L</td>
          <td><strong>${r.waterAllocated.toLocaleString()} L</strong></td>
          <td>
            <div class="opt-prog-wrap">
              <div class="opt-prog-bar">
                <div class="opt-prog-fill ${covPct < 100 ? 'short' : ''}" style="transform: scaleX(${covPct / 100});"></div>
              </div>
              <span class="opt-prog-pct">${covPct}%</span>
            </div>
          </td>
        </tr>
      `;
    }
    this.dom.allocTableBody.innerHTML = html;
    this.dom.sumDemanded.textContent = `${totalDemand.toLocaleString()} L`;
    this.dom.sumAllocated.textContent = `${allocatedTotal.toLocaleString()} L`;
    this.dom.sumUnmet.textContent = `${Math.max(0, totalDemand - allocatedTotal).toLocaleString()} L`;
  }

  executeIrrigationCycle() {
    if (this.isSimulating) return;

    if (this.dispatchStatus.type === 'DELAYED') {
      this.sound.playTone(220, 'sawtooth', 0.2);
      alert(`[AGRIFLOW ADVISORY]\nIrrigation DELAYED by Weather Gating.\n\n${this.dispatchStatus.reason}`);
      return;
    }

    const totalToDisperse = this.regions.reduce((acc, r) => acc + r.waterAllocated, 0);
    if (totalToDisperse === 0) {
      this.sound.playTone(440, 'sine', 0.1);
      return;
    }

    this.isSimulating = true;
    const btn = document.getElementById('btn-run-simulation');
    if (btn) { btn.disabled = true; btn.textContent = 'Irrigating...'; }

    // Toggle droplet visibility via classes
    this.regions.forEach(r => {
      if (r.waterAllocated > 0) this.dom[`card_${r.id}`].classList.add('irrigating');
    });

    this.sound.playWaterSprinkler();
    this.logTelemetry('ACTION', `Dispensing ${totalToDisperse.toLocaleString()} L across sectors.`);

    const duration = 2000; // 2 seconds execution
    const startTime = performance.now();
    const startMoisture = this.regions.map(r => r.currentMoisture);
    const startReservoir = this.reservoir.waterAvailable;

    // Delta-time decoupled animation loop using requestAnimationFrame (60fps on mobile)
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      for (let i = 0; i < 4; i++) {
        const r = this.regions[i];
        if (r.waterAllocated > 0) {
          const totalLift = r.waterAllocated / r.kFactor;
          r.currentMoisture = Math.min(r.targetMoisture, Math.round((startMoisture[i] + totalLift * progress) * 10) / 10);
          this.dom[`curVal_${r.id}`].textContent = `${r.currentMoisture.toFixed(1)}%`;
          this.dom[`sliderCur_${r.id}`].value = r.currentMoisture;
        }
      }

      this.reservoir.waterAvailable = Math.max(0, Math.round(startReservoir - totalToDisperse * progress));
      this.dom.reservoirValText.textContent = this.reservoir.waterAvailable.toLocaleString();
      if (this.dom.sliderReservoir) this.dom.sliderReservoir.value = this.reservoir.waterAvailable;

      this.recomputeAll();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.regions.forEach(r => { this.dom[`card_${r.id}`].classList.remove('irrigating'); });
        this.isSimulating = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Execute Irrigation Cycle
          `;
        }
        this.logTelemetry('ACTION', 'Irrigation cycle complete. Reservoir updated.');
        this.sound.playTone(880, 'sine', 0.2);
      }
    };

    requestAnimationFrame(animate);
  }

  randomizeScenario() {
    const soilKeys = Object.keys(SOIL_PROFILES);
    this.regions.forEach(r => {
      r.soilType = soilKeys[Math.floor(Math.random() * soilKeys.length)];
      const prof = SOIL_PROFILES[r.soilType];
      r.targetMoisture = prof.defaultTarget;
      r.kFactor = this.generateRandomK(r.soilType);
      r.currentMoisture = Math.max(4, Math.round((prof.wiltingPoint + Math.random() * (prof.defaultTarget - prof.wiltingPoint)) * 10) / 10);

      document.getElementById(`soil-select-${r.id}`).value = r.soilType;
      this.dom[`tgtInput_${r.id}`].value = r.targetMoisture;
      this.dom[`tgtLabel_${r.id}`].textContent = `${r.targetMoisture}%`;
      this.dom[`tgtDisp_${r.id}`].textContent = `${r.targetMoisture}%`;
      this.dom[`curVal_${r.id}`].textContent = `${r.currentMoisture.toFixed(1)}%`;
      this.dom[`sliderCur_${r.id}`].value = r.currentMoisture;
      this.dom[`kVal_${r.id}`].textContent = `${r.kFactor} L/%`;
    });

    const modes = ['sunny_dry', 'mild_opt', 'storm_incoming', 'light_drizzle'];
    const chosenMode = modes[Math.floor(Math.random() * modes.length)];
    this.applyWeatherPreset(chosenMode);
    document.getElementById('weather-preset-select').value = chosenMode;

    const resLevels = [2500, 4500, 7500, 11000];
    this.reservoir.waterAvailable = resLevels[Math.floor(Math.random() * resLevels.length)];
    if (this.dom.sliderReservoir) this.dom.sliderReservoir.value = this.reservoir.waterAvailable;
    this.dom.reservoirValText.textContent = this.reservoir.waterAvailable.toLocaleString();

    this.recomputeAll();
    this.logTelemetry('SYSTEM', 'Random scenario initialized.');
    this.sound.playTone(660, 'sine', 0.1);
  }

  logTelemetry(type, message) {
    if (!this.dom.logsBody) return;
    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type.toLowerCase()}`;
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="log-msg">${message}</span>`;
    this.dom.logsBody.appendChild(entry);
    this.dom.logsBody.scrollTop = this.dom.logsBody.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.argiFlow = new IrrigationControllerApp();
  window.argiFlow.init();
});
