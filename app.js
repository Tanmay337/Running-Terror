/**
 * ArgiFlow™️ // Autonomous Precision Agro-Hydrology Engine
 * Pure ES6+ Modular State-Driven Architecture
 * Automated Soil & Weather Telemetry Model
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
}

const SOIL_PROFILES = {
  clay: { name: 'Clay Soil', defaultTarget: 36, wiltingPoint: 22, fieldCapacity: 45, kMin: 130, kMax: 170, droughtVulnerability: 0.85, retentionMultiplier: 0.2 },
  sandy: { name: 'Sandy Soil', defaultTarget: 18, wiltingPoint: 7, fieldCapacity: 25, kMin: 65, kMax: 95, droughtVulnerability: 1.45, retentionMultiplier: 0.7 },
  loamy: { name: 'Loamy Soil', defaultTarget: 28, wiltingPoint: 13, fieldCapacity: 35, kMin: 95, kMax: 135, droughtVulnerability: 1.00, retentionMultiplier: 0.35 },
  silt_loam: { name: 'Silt Loam', defaultTarget: 32, wiltingPoint: 15, fieldCapacity: 40, kMin: 110, kMax: 150, droughtVulnerability: 0.95, retentionMultiplier: 0.28 },
  peaty: { name: 'Peaty / Org', defaultTarget: 42, wiltingPoint: 24, fieldCapacity: 55, kMin: 140, kMax: 190, droughtVulnerability: 0.80, retentionMultiplier: 0.18 }
};

const CROP_STAGES = {
  initial: { name: 'Initial / Seeding', kc: 0.45 },
  development: { name: 'Vegetative Dev', kc: 0.85 },
  mid: { name: 'Mid-Season Flow', kc: 1.15 },
  late: { name: 'Late / Maturity', kc: 0.70 }
};

class IrrigationControllerApp {
  constructor() {
    this.sound = new AudioController();

    this.totalArea = 100; // Custom monitored land in Hectares
    this.quadrantArea = 25.0; // Scaled per quadrant (totalArea / 4)

    this.regions = [
      { id: 1, letter: 'A', name: 'Sector Alpha', quadrant: 'NW', crop: 'Soybeans', stage: 'mid', soilType: 'clay', targetMoisture: 36, currentMoisture: 23, kBase: 145, kFactor: 145, deficit: 0, etc: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 2, letter: 'B', name: 'Sector Beta', quadrant: 'NE', crop: 'Maize / Corn', stage: 'development', soilType: 'sandy', targetMoisture: 18, currentMoisture: 10, kBase: 78, kFactor: 78, deficit: 0, etc: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 3, letter: 'C', name: 'Sector Gamma', quadrant: 'SW', crop: 'Winter Wheat', stage: 'development', soilType: 'loamy', targetMoisture: 28, currentMoisture: 17, kBase: 112, kFactor: 112, deficit: 0, etc: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 4, letter: 'D', name: 'Sector Delta', quadrant: 'SE', crop: 'Sunflowers', stage: 'initial', soilType: 'silt_loam', targetMoisture: 32, currentMoisture: 21, kBase: 126, kFactor: 126, deficit: 0, etc: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false }
    ];

    this.weather = {
      rainForecastMm: 0,
      humidityPct: 45,
      temperatureC: 30,
      windSpeedKmh: 12,
      et0: 4.8,
      vpd: 1.4
    };

    this.reservoir = {
      maxCapacity: 20000000,
      waterAvailable: 15000000
    };

    this.optimizationStrategy = 'smart';
    this.controllerMode = 'precision';
    this.dispatchStatus = { type: 'INSTANT', title: 'INSTANT IRRIGATION AUTHORIZED', reason: '', waterSaved: 0 };
    this.isSimulating = false;

    this.dom = {};
  }

  init() {
    this.cacheStaticDOM();
    this.renderZones();
    this.bindEvents();
    this.updateAreaScale(this.totalArea);
    this.setReservoirAvailable(this.reservoir.waterAvailable, false);
    this.fetchWeather();
    this.recomputeAll();
    this.initCharts();
    this.logTelemetry('SYSTEM', `🌱 ArgiFlow Autonomous Engine active. Land: ${this.totalArea} Ha | Reservoir: ${this.reservoir.waterAvailable.toLocaleString()} L.`);
  }

  cacheStaticDOM() {
    this.dom.inputTotalArea = document.getElementById('input-total-area');
    this.dom.kpiQuadrantSubtext = document.getElementById('kpi-quadrant-subtext');
    this.dom.fieldTopologyDesc = document.getElementById('field-topology-desc');

    this.dom.inputKpiReservoir = document.getElementById('input-kpi-reservoir');
    this.dom.resValInput = document.getElementById('res-val-input');
    this.dom.resSlider = document.getElementById('res-slider');

    this.dom.kpiDemand = document.getElementById('kpi-demand');
    this.dom.kpiEt0 = document.getElementById('kpi-et0');
    this.dom.kpiCoverage = document.getElementById('kpi-coverage');
    this.dom.kpiDispatch = document.getElementById('kpi-dispatch');
    this.dom.kpiDispatchReason = document.getElementById('kpi-dispatch-reason');

    this.dom.wRain = document.getElementById('w-rain');
    this.dom.wTemp = document.getElementById('w-temp');
    this.dom.wRh = document.getElementById('w-rh');
    this.dom.wWind = document.getElementById('w-wind');
    this.dom.wEt0 = document.getElementById('w-et0');
    this.dom.wVpd = document.getElementById('w-vpd');

    this.dom.decisionBox = document.getElementById('decision');
    this.dom.decisionTitle = document.getElementById('decision-title');
    this.dom.decisionBadge = document.getElementById('decision-badge');
    this.dom.decisionText = document.getElementById('decision-text');

    this.dom.allocationBody = document.getElementById('allocation-body');
    this.dom.sensorHealth = document.getElementById('sensor-health');
    this.dom.logsBody = document.getElementById('logs');

    this.dom.dynamicWater = document.getElementById('dynamic-water');
    this.dom.dynamicEvents = document.getElementById('dynamic-events');
    this.dom.fixedWater = document.getElementById('fixed-water');
    this.dom.fixedEvents = document.getElementById('fixed-events');
    this.dom.savedWater = document.getElementById('saved-water');
    this.dom.savedPct = document.getElementById('saved-pct');
    this.dom.stressResult = document.getElementById('stress-result');
  }

  updateAreaScale(newTotalArea) {
    this.totalArea = Math.max(4, Math.min(5000, newTotalArea));
    this.quadrantArea = Math.round((this.totalArea / 4) * 10) / 10;

    const areaScaleMultiplier = this.quadrantArea / 25.0;
    this.regions.forEach(r => {
      r.kFactor = Math.round(r.kBase * areaScaleMultiplier);
      const metaEl = document.getElementById(`zone-meta-${r.id}`);
      if (metaEl) metaEl.textContent = `${this.quadrantArea.toFixed(1)} ha • ${r.quadrant}`;
    });

    if (this.dom.kpiQuadrantSubtext) {
      this.dom.kpiQuadrantSubtext.textContent = `4 × ${this.quadrantArea.toFixed(1)} ha zones`;
    }
    if (this.dom.fieldTopologyDesc) {
      this.dom.fieldTopologyDesc.textContent = `Autonomous soil sensors + location-driven telemetry model (4 × ${this.quadrantArea.toFixed(1)} ha).`;
    }
  }

  setReservoirAvailable(liters, log = true) {
    const val = Math.max(0, Math.min(100000000, Math.round(liters)));
    this.reservoir.waterAvailable = val;

    this.reservoir.maxCapacity = Math.max(20000000, val);
    if (this.dom.resSlider) {
      this.dom.resSlider.max = this.reservoir.maxCapacity;
      this.dom.resSlider.value = Math.min(val, this.dom.resSlider.max);
    }

    if (this.dom.inputKpiReservoir && document.activeElement !== this.dom.inputKpiReservoir) {
      this.dom.inputKpiReservoir.value = val;
    }
    if (this.dom.resValInput && document.activeElement !== this.dom.resValInput) {
      this.dom.resValInput.value = val;
    }

    if (log) {
      this.logTelemetry('ACTION', `Reservoir storage updated: ${val.toLocaleString()} L.`);
    }
  }

  renderZones() {
    const container = document.getElementById('zones');
    if (!container) return;
    container.innerHTML = '';

    this.regions.forEach(r => {
      const zoneEl = document.createElement('div');
      zoneEl.className = `zone ${r.isIrrigating ? 'irrigating' : ''} ${r.sensorFailed ? 'failed' : ''}`;
      zoneEl.id = `zone-${r.id}`;

      zoneEl.innerHTML = `
        <div class="zone-head">
          <div class="zone-name">
            <div class="zone-letter">${r.letter}</div>
            <div>
              <div class="zone-title">${r.name}</div>
              <div class="zone-meta" id="zone-meta-${r.id}">${this.quadrantArea.toFixed(1)} ha • ${r.quadrant}</div>
            </div>
          </div>
          <span class="crop">${r.crop}</span>
        </div>

        <div class="zone-controls">
          <div class="form-group">
            <label>Soil Profile</label>
            <select class="soil-select" data-id="${r.id}">
              <option value="clay" ${r.soilType === 'clay' ? 'selected' : ''}>Clay (~36%)</option>
              <option value="sandy" ${r.soilType === 'sandy' ? 'selected' : ''}>Sandy (~18%)</option>
              <option value="loamy" ${r.soilType === 'loamy' ? 'selected' : ''}>Loamy (~28%)</option>
              <option value="silt_loam" ${r.soilType === 'silt_loam' ? 'selected' : ''}>Silt Loam (~32%)</option>
              <option value="peaty" ${r.soilType === 'peaty' ? 'selected' : ''}>Peaty (~42%)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Crop Growth Stage</label>
            <select class="stage-select" data-id="${r.id}">
              <option value="initial" ${r.stage === 'initial' ? 'selected' : ''}>Initial (Kc 0.45)</option>
              <option value="development" ${r.stage === 'development' ? 'selected' : ''}>Dev (Kc 0.85)</option>
              <option value="mid" ${r.stage === 'mid' ? 'selected' : ''}>Mid (Kc 1.15)</option>
              <option value="late" ${r.stage === 'late' ? 'selected' : ''}>Late (Kc 0.70)</option>
            </select>
          </div>
        </div>

        <div class="sensor-line">
          <span>Telemetry: <b class="${r.sensorFailed ? 'sensor-fail' : 'sensor-ok'}" id="sensor-status-${r.id}">${r.sensorFailed ? 'FAULT // ET Estimation' : 'LIVE // In-Situ'}</b></span>
          <button class="sensor-toggle" data-id="${r.id}">[${r.sensorFailed ? 'Restore' : 'Simulate Fail'}]</button>
        </div>

        <div class="moisture">
          <div class="moisture-head">
            <span>Soil Moisture (VWC)</span>
            <span><strong id="cur-m-${r.id}">${r.currentMoisture}%</strong> / <span id="tgt-m-${r.id}">${r.targetMoisture}%</span></span>
          </div>
          <div class="meter">
            <div class="meter-current" id="meter-bar-${r.id}" style="transform: scaleX(${Math.min(1, r.currentMoisture / 50)});"></div>
            <div class="meter-target" style="left: ${(r.targetMoisture / 50) * 100}%;"></div>
          </div>
        </div>

        <div class="zone-stats">
          <div class="zone-stat">
            <span>Deficit</span>
            <b id="def-val-${r.id}">${r.deficit}%</b>
          </div>
          <div class="zone-stat">
            <span>ETc</span>
            <b id="etc-val-${r.id}">${r.etc} mm</b>
          </div>
          <div class="zone-stat">
            <span>Demand</span>
            <b id="req-val-${r.id}">${r.waterRequired.toLocaleString()} L</b>
          </div>
        </div>
      `;

      container.appendChild(zoneEl);
    });

    this.bindZoneInputs();
  }

  bindZoneInputs() {
    document.querySelectorAll('.soil-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const r = this.regions.find(x => x.id === id);
        r.soilType = e.target.value;
        const prof = SOIL_PROFILES[r.soilType];
        r.targetMoisture = prof.defaultTarget;
        r.kBase = Math.round(prof.kMin + Math.random() * (prof.kMax - prof.kMin));
        r.kFactor = Math.round(r.kBase * (this.quadrantArea / 25.0));

        // Re-simulate realistic moisture on soil change
        r.currentMoisture = Math.max(prof.wiltingPoint + 2, Math.round((prof.wiltingPoint + Math.random() * (prof.defaultTarget - prof.wiltingPoint)) * 10) / 10);

        document.getElementById(`tgt-m-${id}`).textContent = `${r.targetMoisture}%`;
        document.getElementById(`cur-m-${id}`).textContent = `${r.currentMoisture.toFixed(1)}%`;
        document.getElementById(`meter-bar-${id}`).style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;

        this.logTelemetry('ACTION', `${r.name} switched to ${prof.name}. Target adjusted to ${prof.defaultTarget}%.`);
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.stage-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const r = this.regions.find(x => x.id === id);
        r.stage = e.target.value;
        this.recomputeAll();
      });
    });

    document.querySelectorAll('.sensor-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const r = this.regions.find(x => x.id === id);
        r.sensorFailed = !r.sensorFailed;
        btn.textContent = `[${r.sensorFailed ? 'Restore' : 'Simulate Fail'}]`;

        const statEl = document.getElementById(`sensor-status-${id}`);
        statEl.textContent = r.sensorFailed ? 'FAULT // ET Estimation' : 'LIVE // In-Situ';
        statEl.className = r.sensorFailed ? 'sensor-fail' : 'sensor-ok';

        const zoneCard = document.getElementById(`zone-${id}`);
        if (r.sensorFailed) zoneCard.classList.add('failed');
        else zoneCard.classList.remove('failed');

        this.logTelemetry('WARN', `${r.name} probe state toggled ${r.sensorFailed ? 'OFFLINE (FAO-56 ET Imputation Active)' : 'ONLINE'}.`);
        this.recomputeAll();
      });
    });
  }

  bindEvents() {
    // 1. Monitored Area Custom Input
    if (this.dom.inputTotalArea) {
      this.dom.inputTotalArea.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 4;
        this.updateAreaScale(val);
        this.recomputeAll();
      });
      this.dom.inputTotalArea.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 4;
        this.logTelemetry('ACTION', `Plot acreage calibrated: ${val} Hectares (${this.quadrantArea} Ha/zone).`);
      });
    }

    // 2. Reservoir KPI Custom Input
    if (this.dom.inputKpiReservoir) {
      this.dom.inputKpiReservoir.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.setReservoirAvailable(val, false);
        this.recomputeAll();
      });
      this.dom.inputKpiReservoir.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.setReservoirAvailable(val, true);
        this.recomputeAll();
      });
    }

    // 3. Studio Reservoir Custom Input
    if (this.dom.resValInput) {
      this.dom.resValInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.setReservoirAvailable(val, false);
        this.recomputeAll();
      });
      this.dom.resValInput.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.setReservoirAvailable(val, true);
        this.recomputeAll();
      });
    }

    // Studio Slider Input
    if (this.dom.resSlider) {
      this.dom.resSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setReservoirAvailable(val, false);
        this.recomputeAll();
      });
    }

    // Quick chips
    document.querySelectorAll('.chips button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.res, 10);
        this.setReservoirAvailable(val, true);
        this.recomputeAll();
      });
    });

    // Sound toggle
    document.getElementById('btn-sound-toggle')?.addEventListener('click', (e) => {
      this.sound.enabled = !this.sound.enabled;
      e.target.textContent = this.sound.enabled ? '🔊' : '🔇';
    });

    // Execute run
    document.getElementById('btn-run')?.addEventListener('click', () => this.executeIrrigationCycle());

    // Fail all sensors
    document.getElementById('btn-fail-all')?.addEventListener('click', () => {
      const anyHealthy = this.regions.some(r => !r.sensorFailed);
      this.regions.forEach(r => { r.sensorFailed = anyHealthy; });
      this.renderZones();
      this.logTelemetry('WARN', `Global telemetry fault toggle: all sensors set to ${anyHealthy ? 'FAULT' : 'OPERATIONAL'}.`);
      this.recomputeAll();
    });

    // Advance 1 day (evapotranspiration simulation)
    document.getElementById('btn-evap')?.addEventListener('click', () => {
      this.simulateAutonomousDailyEvaporation();
    });

    // Location search
    document.getElementById('btn-search')?.addEventListener('click', () => {
      const query = document.getElementById('location-input')?.value;
      if (query) this.searchLocation(query);
    });

    document.getElementById('btn-location')?.addEventListener('click', () => this.getGeolocation());

    // Strategy & Mode
    document.getElementById('strategy')?.addEventListener('change', (e) => {
      this.optimizationStrategy = e.target.value;
      this.recomputeAll();
    });

    document.getElementById('controller-mode')?.addEventListener('change', (e) => {
      this.controllerMode = e.target.value;
      this.recomputeAll();
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (this.dom.logsBody) {
        this.dom.logsBody.innerHTML = `<div>[SYSTEM] Logs cleared. Autonomous telemetry standby.</div>`;
      }
    });
  }

  simulateAutonomousDailyEvaporation() {
    this.regions.forEach(r => {
      const prof = SOIL_PROFILES[r.soilType];
      // Depletion is driven by atmospheric ETc scaled by soil percolation characteristics
      const dailyLoss = (r.etc * 0.5) * prof.retentionMultiplier;
      r.currentMoisture = Math.max(prof.wiltingPoint - 1, Math.round((r.currentMoisture - dailyLoss) * 10) / 10);
      
      const curEl = document.getElementById(`cur-m-${r.id}`);
      if (curEl) curEl.textContent = `${r.currentMoisture.toFixed(1)}%`;
      const barEl = document.getElementById(`meter-bar-${r.id}`);
      if (barEl) barEl.style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
    });

    this.logTelemetry('ACTION', `Day advanced: Simulated autonomous depletion from ETc (${this.weather.et0} mm reference) and soil percolation.`);
    this.recomputeAll();
  }

  async fetchWeather(lat = 26.9124, lon = 75.7873) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,et0_fao_evapotranspiration&current_weather=true&hourly=relativehumidity_2m&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('API unreachable');
      const data = await res.json();

      this.weather.rainForecastMm = data.daily?.precipitation_sum?.[0] ?? 0;
      this.weather.temperatureC = data.current_weather?.temperature ?? 30;
      this.weather.windSpeedKmh = data.current_weather?.windspeed ?? 12;
      this.weather.humidityPct = data.hourly?.relativehumidity_2m?.[0] ?? 45;
      this.weather.et0 = data.daily?.et0_fao_evapotranspiration?.[0] ?? 4.8;

      // Vapor Pressure Deficit calculation
      const es = 0.6108 * Math.exp((17.27 * this.weather.temperatureC) / (this.weather.temperatureC + 237.3));
      const ea = es * (this.weather.humidityPct / 100);
      this.weather.vpd = Math.round((es - ea) * 10) / 10;

      // Autonomously recharge soil moisture if rain forecast is active
      if (this.weather.rainForecastMm > 0) {
        this.regions.forEach(r => {
          const prof = SOIL_PROFILES[r.soilType];
          const rainRecharge = this.weather.rainForecastMm * 0.4;
          r.currentMoisture = Math.min(prof.fieldCapacity, Math.round((r.currentMoisture + rainRecharge) * 10) / 10);
          const curEl = document.getElementById(`cur-m-${r.id}`);
          if (curEl) curEl.textContent = `${r.currentMoisture.toFixed(1)}%`;
          const barEl = document.getElementById(`meter-bar-${r.id}`);
          if (barEl) barEl.style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
        });
      }

      const statusPill = document.getElementById('api-status');
      if (statusPill) statusPill.innerHTML = '<span class="pulse-dot"></span><span>WEATHER: OPEN-METEO LIVE</span>';

      this.recomputeAll();
    } catch (err) {
      this.recomputeAll();
    }
  }

  async searchLocation(query) {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=4`);
      const data = await res.json();
      const resultsDiv = document.getElementById('location-results');
      if (!resultsDiv) return;
      resultsDiv.innerHTML = '';

      if (data.results && data.results.length > 0) {
        data.results.forEach(loc => {
          const chip = document.createElement('div');
          chip.className = 'location-chip';
          chip.textContent = `${loc.name}, ${loc.country || ''}`;
          chip.onclick = () => {
            document.getElementById('location-input').value = `${loc.name}, ${loc.country || ''}`;
            resultsDiv.innerHTML = '';
            this.fetchWeather(loc.latitude, loc.longitude);
            this.logTelemetry('SYSTEM', `Location changed to ${loc.name}. Autonomous weather telemetry calibrated.`);
          };
          resultsDiv.appendChild(chip);
        });
      }
    } catch (e) {}
  }

  getGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.fetchWeather(pos.coords.latitude, pos.coords.longitude);
          document.getElementById('location-input').value = `GPS: ${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
          this.logTelemetry('SYSTEM', 'Autonomous GPS telemetry ingested.');
        },
        () => this.logTelemetry('WARN', 'GPS permission denied. Using default coordinates.')
      );
    }
  }

  recomputeAll() {
    let totalDemand = 0;

    this.regions.forEach(r => {
      const kc = CROP_STAGES[r.stage].kc;
      r.etc = Math.round((this.weather.et0 * kc) * 10) / 10;
      r.deficit = Math.max(0, Math.round((r.targetMoisture - r.currentMoisture) * 10) / 10);
      r.waterRequired = Math.round(r.deficit * r.kFactor * 100);

      totalDemand += r.waterRequired;

      const defEl = document.getElementById(`def-val-${r.id}`);
      if (defEl) defEl.textContent = `${r.deficit}%`;

      const etcEl = document.getElementById(`etc-val-${r.id}`);
      if (etcEl) etcEl.textContent = `${r.etc} mm`;

      const reqEl = document.getElementById(`req-val-${r.id}`);
      if (reqEl) reqEl.textContent = `${r.waterRequired.toLocaleString()} L`;
    });

    this.evaluateWeather(totalDemand);
    this.optimizeAllocation(totalDemand);
    this.renderHUD(totalDemand);
    this.renderAllocationTable();
    this.renderSensorHealth();
    this.updateComparisonMetrics(totalDemand);
  }

  evaluateWeather(totalDemand) {
    const rain = this.weather.rainForecastMm;
    const hum = this.weather.humidityPct;

    if (totalDemand === 0) {
      this.dispatchStatus = {
        type: 'STANDBY',
        title: 'STANDBY // OPTIMAL SOIL MOISTURE',
        reason: 'Soil water content is currently satisfied across monitored sectors.',
        waterSaved: 0
      };
    } else if (rain >= 5) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // HEAVY RAIN IMMINENT',
        reason: `Automated forecast predicts ${rain} mm rainfall. Natural precipitation satisfies root zone.`,
        waterSaved: totalDemand
      };
    } else if (hum >= 80 && rain >= 2) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // HIGH HUMIDITY & LIGHT RAIN',
        reason: `Relative humidity (${hum}%) and passing drizzle suppresses crop transpiration.`,
        waterSaved: totalDemand
      };
    } else {
      this.dispatchStatus = {
        type: 'INSTANT',
        title: 'INSTANT IRRIGATION AUTHORIZED',
        reason: `Clear atmospheric window (${rain} mm rain, ${hum}% RH). Soil moisture deficit active.`,
        waterSaved: 0
      };
    }

    if (this.dom.decisionBox && this.dom.decisionTitle && this.dom.decisionBadge && this.dom.decisionText) {
      this.dom.decisionTitle.textContent = this.dispatchStatus.title;
      this.dom.decisionText.textContent = this.dispatchStatus.reason;
      this.dom.decisionBadge.textContent = this.dispatchStatus.type;

      if (this.dispatchStatus.type === 'INSTANT') {
        this.dom.decisionBox.className = 'decision';
        this.dom.decisionBadge.className = 'badge success';
      } else if (this.dispatchStatus.type === 'DELAYED') {
        this.dom.decisionBox.className = 'decision delayed';
        this.dom.decisionBadge.className = 'badge warning';
      } else {
        this.dom.decisionBox.className = 'decision';
        this.dom.decisionBadge.className = 'badge';
      }
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

    if (this.optimizationStrategy === 'triage') {
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
    const weights = {};
    this.regions.forEach(r => {
      const prof = SOIL_PROFILES[r.soilType];
      const w = r.deficit * prof.droughtVulnerability;
      weights[r.id] = w;
      totalWeight += w;
    });

    if (totalWeight === 0) {
      this.regions.forEach(r => { r.waterAllocated = 0; });
      return;
    }

    this.regions.forEach(r => {
      r.waterAllocated = Math.min(r.waterRequired, Math.floor((weights[r.id] / totalWeight) * avail));
    });
  }

  renderHUD(totalDemand) {
    if (this.dom.kpiDemand) this.dom.kpiDemand.textContent = `${totalDemand.toLocaleString()} L`;
    if (this.dom.kpiEt0) this.dom.kpiEt0.textContent = `${this.weather.et0} mm/d`;

    const avail = this.reservoir.waterAvailable;
    const cov = totalDemand > 0 ? Math.round((avail / totalDemand) * 100) : 100;
    if (this.dom.kpiCoverage) {
      this.dom.kpiCoverage.textContent = `Coverage: ${cov}% (${avail >= totalDemand ? 'Surplus' : 'Deficit'})`;
    }

    if (this.dom.kpiDispatch && this.dom.kpiDispatchReason) {
      this.dom.kpiDispatch.textContent = this.dispatchStatus.type;
      this.dom.kpiDispatchReason.textContent = this.dispatchStatus.type === 'INSTANT' ? 'Clear window' : 'Weather gate active';
    }

    if (this.dom.wRain) this.dom.wRain.textContent = `${this.weather.rainForecastMm} mm`;
    if (this.dom.wTemp) this.dom.wTemp.textContent = `${this.weather.temperatureC} °C`;
    if (this.dom.wRh) this.dom.wRh.textContent = `${this.weather.humidityPct}%`;
    if (this.dom.wWind) this.dom.wWind.textContent = `${this.weather.windSpeedKmh} km/h`;
    if (this.dom.wEt0) this.dom.wEt0.textContent = `${this.weather.et0} mm`;
    if (this.dom.wVpd) this.dom.wVpd.textContent = `${this.weather.vpd} kPa`;
  }

  renderAllocationTable() {
    if (!this.dom.allocationBody) return;
    this.dom.allocationBody.innerHTML = '';

    this.regions.forEach(r => {
      const covPct = r.waterRequired > 0 ? Math.round((r.waterAllocated / r.waterRequired) * 100) : 100;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${r.letter}</strong> - ${r.name}</td>
        <td>${r.etc} mm</td>
        <td>${r.waterRequired.toLocaleString()} L</td>
        <td><strong>${r.waterAllocated.toLocaleString()} L</strong></td>
        <td>
          <div class="progress ${covPct < 100 ? 'short' : ''}">
            <i style="transform: scaleX(${covPct / 100});"></i>
          </div>
          ${covPct}%
        </td>
      `;
      this.dom.allocationBody.appendChild(row);
    });
  }

  renderSensorHealth() {
    if (!this.dom.sensorHealth) return;
    this.dom.sensorHealth.innerHTML = '';

    this.regions.forEach(r => {
      const card = document.createElement('div');
      card.className = 'sensor-card';
      card.innerHTML = `
        <span>Zone ${r.letter} Sensor</span>
        <b class="${r.sensorFailed ? 'sensor-fail' : 'sensor-ok'}">${r.sensorFailed ? 'FAULT // ET Estimation' : 'LIVE // In-Situ'}</b>
      `;
      this.dom.sensorHealth.appendChild(card);
    });
  }

  updateComparisonMetrics(totalDemand) {
    if (!this.dom.dynamicWater) return;

    const dynamicTotal = this.regions.reduce((a, b) => a + b.waterAllocated, 0);
    const fixedTotal = Math.round(this.totalArea * 500000);
    const saved = Math.max(0, fixedTotal - dynamicTotal);
    const savedPct = Math.round((saved / fixedTotal) * 100);

    this.dom.dynamicWater.textContent = `${(dynamicTotal / 1000000).toFixed(2)}M L`;
    this.dom.dynamicEvents.textContent = 'Gated & Targeted';

    this.dom.fixedWater.textContent = `${(fixedTotal / 1000000).toFixed(2)}M L`;
    this.dom.fixedEvents.textContent = 'Scheduled calendar';

    this.dom.savedWater.textContent = `${(saved / 1000000).toFixed(2)}M L`;
    this.dom.savedPct.textContent = `${savedPct}% Saved`;

    const stressedZones = this.regions.filter(r => r.deficit > 10).length;
    this.dom.stressResult.textContent = `${stressedZones} of 4 zones`;
  }

  executeIrrigationCycle() {
    if (this.isSimulating) return;

    if (this.dispatchStatus.type === 'DELAYED') {
      alert(`[AGRIFLOW ADVISORY]\nIrrigation DELAYED by Weather Gating.\n\n${this.dispatchStatus.reason}`);
      return;
    }

    const totalToDisperse = this.regions.reduce((acc, r) => acc + r.waterAllocated, 0);
    if (totalToDisperse === 0) return;

    this.isSimulating = true;
    const btn = document.getElementById('btn-run');
    if (btn) { btn.disabled = true; btn.textContent = 'Irrigating Zones...'; }

    this.regions.forEach(r => {
      if (r.waterAllocated > 0) {
        document.getElementById(`zone-${r.id}`)?.classList.add('irrigating');
      }
    });

    this.sound.playTone(580, 'sine', 0.25);
    this.logTelemetry('ACTION', `Dispensing ${(totalToDisperse).toLocaleString()} L across custom land parcels (${this.quadrantArea} ha/zone).`);

    const duration = 2000;
    const startTime = performance.now();
    const startMoisture = this.regions.map(r => r.currentMoisture);
    const startReservoir = this.reservoir.waterAvailable;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      this.regions.forEach((r, idx) => {
        if (r.waterAllocated > 0) {
          const lift = (r.waterAllocated / (r.kFactor * 100)) * progress;
          r.currentMoisture = Math.min(r.targetMoisture, Math.round((startMoisture[idx] + lift) * 10) / 10);
          const curEl = document.getElementById(`cur-m-${r.id}`);
          if (curEl) curEl.textContent = `${r.currentMoisture.toFixed(1)}%`;
          const barEl = document.getElementById(`meter-bar-${r.id}`);
          if (barEl) barEl.style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
        }
      });

      const currentRemaining = Math.max(0, Math.round(startReservoir - totalToDisperse * progress));
      this.setReservoirAvailable(currentRemaining, false);
      this.recomputeAll();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.regions.forEach(r => {
          document.getElementById(`zone-${r.id}`)?.classList.remove('irrigating');
        });
        this.isSimulating = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = '▶️ Execute Irrigation Cycle';
        }
        this.logTelemetry('ACTION', `Irrigation cycle complete. Storage updated.`);
        this.sound.playTone(880, 'sine', 0.2);
      }
    };

    requestAnimationFrame(animate);
  }

  initCharts() {
    if (typeof Plotly === 'undefined') return;

    // Precision vs Fixed comparison chart
    const compData = [
      {
        x: ['Sector A', 'Sector B', 'Sector C', 'Sector D'],
        y: [1.2, 0.8, 1.0, 0.9],
        name: 'Precision Controller',
        type: 'bar',
        marker: { color: '#2e7d52' }
      },
      {
        x: ['Sector A', 'Sector B', 'Sector C', 'Sector D'],
        y: [2.5, 2.5, 2.5, 2.5],
        name: 'Fixed Schedule',
        type: 'bar',
        marker: { color: '#8a978f' }
      }
    ];

    const compLayout = {
      barmode: 'group',
      margin: { t: 20, b: 30, l: 40, r: 20 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      yaxis: { title: 'M Liters' },
      showlegend: true,
      legend: { orientation: 'h', y: 1.15 }
    };

    Plotly.newPlot('comparison-chart', compData, compLayout, { responsive: true, displayModeBar: false });

    // Weather forecast chart
    const foreData = [{
      x: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
      y: [4.8, 5.2, 3.9, 4.5, 5.0],
      type: 'scatter',
      mode: 'lines+markers',
      name: 'ET₀ (mm)',
      line: { color: '#0284c7', width: 3 }
    }];

    const foreLayout = {
      margin: { t: 20, b: 30, l: 40, r: 20 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      yaxis: { title: 'Reference ET₀ (mm)' }
    };

    Plotly.newPlot('forecast-chart', foreData, foreLayout, { responsive: true, displayModeBar: false });
  }

  logTelemetry(type, message) {
    if (!this.dom.logsBody) return;
    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.innerHTML = `[${timeStr}] [${type}] ${message}`;
    this.dom.logsBody.appendChild(entry);
    this.dom.logsBody.scrollTop = this.dom.logsBody.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.argiFlow = new IrrigationControllerApp();
  window.argiFlow.init();
});
