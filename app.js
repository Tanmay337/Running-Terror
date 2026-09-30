/**
 * AgriFlow™️ // Autonomous Precision Agro-Hydrology Engine
 * Pure ES6+ Modular State-Driven Architecture
 * Automated Telemetry & Location-Driven Dynamic Demand Model
 * With Manual Override Sliders for Zones, Soil, and Atmospheric Telemetry
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
  clay: { name: 'Clay Soil', defaultTarget: 36, wiltingPoint: 22, fieldCapacity: 45, kMin: 130, kMax: 170, droughtVulnerability: 0.85, retentionMultiplier: 0.20 },
  sandy: { name: 'Sandy Soil', defaultTarget: 18, wiltingPoint: 7, fieldCapacity: 25, kMin: 65, kMax: 95, droughtVulnerability: 1.45, retentionMultiplier: 0.70 },
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

    this.currentLocationName = "Jaipur, India";
    this.coords = { lat: 26.9124, lon: 75.7873 };

    this.regions = [
      { id: 1, letter: 'A', name: 'Sector Alpha', quadrant: 'NW', crop: 'Soybeans', stage: 'mid', soilType: 'clay', targetMoisture: 36, currentMoisture: 24.0, kBase: 145, kFactor: 145, deficit: 0, etc: 0, etcLiters: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 2, letter: 'B', name: 'Sector Beta', quadrant: 'NE', crop: 'Maize / Corn', stage: 'development', soilType: 'sandy', targetMoisture: 18, currentMoisture: 11.0, kBase: 78, kFactor: 78, deficit: 0, etc: 0, etcLiters: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 3, letter: 'C', name: 'Sector Gamma', quadrant: 'SW', crop: 'Winter Wheat', stage: 'development', soilType: 'loamy', targetMoisture: 28, currentMoisture: 18.0, kBase: 112, kFactor: 112, deficit: 0, etc: 0, etcLiters: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false },
      { id: 4, letter: 'D', name: 'Sector Delta', quadrant: 'SE', crop: 'Sunflowers', stage: 'initial', soilType: 'silt_loam', targetMoisture: 32, currentMoisture: 22.0, kBase: 126, kFactor: 126, deficit: 0, etc: 0, etcLiters: 0, waterRequired: 0, waterAllocated: 0, sensorFailed: false, isIrrigating: false }
    ];

    this.weather = {
      rainForecastMm: 0,
      humidityPct: 45,
      temperatureC: 30,
      windSpeedKmh: 12,
      et0: 4.8,
      vpd: 1.4,
      forecastDays: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
      forecastET0: [4.8, 5.2, 3.9, 4.5, 5.0]
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
    this.fetchWeather(this.coords.lat, this.coords.lon, this.currentLocationName);
    this.logTelemetry('SYSTEM', `🌱 AgriFlow Engine active. Monitored Area: ${this.totalArea} Ha | Storage: ${this.reservoir.waterAvailable.toLocaleString()} L.`);
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

    this.dom.sliderRain = document.getElementById('slider-rain');
    this.dom.sliderTemp = document.getElementById('slider-temp');
    this.dom.sliderHumidity = document.getElementById('slider-humidity');
    this.dom.sliderWind = document.getElementById('slider-wind');

    this.dom.valRain = document.getElementById('val-rain');
    this.dom.valTemp = document.getElementById('val-temp');
    this.dom.valHumidity = document.getElementById('val-humidity');
    this.dom.valWind = document.getElementById('val-wind');

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

        <!-- Target Moisture Slider -->
        <div class="sub-slider-wrap">
          <label for="slider-target-${r.id}">Target Moisture: <b id="val-target-label-${r.id}">${r.targetMoisture}%</b></label>
          <input type="range" class="slider-target" id="slider-target-${r.id}" data-id="${r.id}" min="5" max="50" step="1" value="${r.targetMoisture}">
        </div>

        <div class="sensor-line">
          <span>Telemetry: <b class="${r.sensorFailed ? 'sensor-fail' : 'sensor-ok'}" id="sensor-status-${r.id}">${r.sensorFailed ? 'FAULT // ET Estimation' : 'LIVE // In-Situ'}</b></span>
          <button class="sensor-toggle" data-id="${r.id}">[${r.sensorFailed ? 'Restore' : 'Simulate Fail'}]</button>
        </div>

        <div class="moisture">
          <div class="moisture-head">
            <span>Soil Moisture (VWC)</span>
            <span><strong id="cur-m-${r.id}">${r.currentMoisture.toFixed(1)}%</strong> / <span id="tgt-m-${r.id}">${r.targetMoisture}%</span></span>
          </div>
          <div class="meter">
            <div class="meter-current" id="meter-bar-${r.id}" style="transform: scaleX(${Math.min(1, r.currentMoisture / 50)});"></div>
            <div class="meter-target" id="meter-target-${r.id}" style="left: ${(r.targetMoisture / 50) * 100}%;"></div>
          </div>
          
          <!-- In-Situ Moisture Slider -->
          <div class="sub-slider-wrap">
            <label for="slider-moisture-${r.id}">In-Situ Override: <b id="val-moisture-label-${r.id}">${r.currentMoisture.toFixed(1)}%</b></label>
            <input type="range" class="slider-moisture" id="slider-moisture-${r.id}" data-id="${r.id}" min="0" max="50" step="0.5" value="${r.currentMoisture}">
          </div>
        </div>

        <div class="zone-stats">
          <div class="zone-stat">
            <span>Deficit</span>
            <b id="def-val-${r.id}">${r.deficit}%</b>
          </div>
          <div class="zone-stat">
            <span>ETc (Loss)</span>
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

        r.currentMoisture = Math.max(prof.wiltingPoint + 1, Math.round((prof.wiltingPoint + (prof.defaultTarget - prof.wiltingPoint) * 0.5) * 10) / 10);

        const targetSlider = document.getElementById(`slider-target-${id}`);
        if (targetSlider) targetSlider.value = r.targetMoisture;
        const targetLabel = document.getElementById(`val-target-label-${id}`);
        if (targetLabel) targetLabel.textContent = `${r.targetMoisture}%`;

        const moistSlider = document.getElementById(`slider-moisture-${id}`);
        if (moistSlider) moistSlider.value = r.currentMoisture;
        const moistLabel = document.getElementById(`val-moisture-label-${id}`);
        if (moistLabel) moistLabel.textContent = `${r.currentMoisture.toFixed(1)}%`;

        document.getElementById(`tgt-m-${id}`).textContent = `${r.targetMoisture}%`;
        document.getElementById(`cur-m-${id}`).textContent = `${r.currentMoisture.toFixed(1)}%`;
        document.getElementById(`meter-bar-${id}`).style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
        document.getElementById(`meter-target-${id}`).style.left = `${(r.targetMoisture / 50) * 100}%`;

        this.logTelemetry('ACTION', `${r.name} switched to ${prof.name}. Target set to ${prof.defaultTarget}%.`);
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

    // Sector Target Moisture Slider Event
    document.querySelectorAll('.slider-target').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = parseFloat(e.target.value);
        const r = this.regions.find(x => x.id === id);
        r.targetMoisture = val;

        const targetLabel = document.getElementById(`val-target-label-${id}`);
        if (targetLabel) targetLabel.textContent = `${val}%`;
        const tgtM = document.getElementById(`tgt-m-${id}`);
        if (tgtM) tgtM.textContent = `${val}%`;
        const meterTarget = document.getElementById(`meter-target-${id}`);
        if (meterTarget) meterTarget.style.left = `${(val / 50) * 100}%`;

        this.recomputeAll();
      });
    });

    // Sector In-Situ Moisture Slider Event
    document.querySelectorAll('.slider-moisture').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const val = parseFloat(e.target.value);
        const r = this.regions.find(x => x.id === id);
        r.currentMoisture = val;

        const moistLabel = document.getElementById(`val-moisture-label-${id}`);
        if (moistLabel) moistLabel.textContent = `${val.toFixed(1)}%`;
        const curM = document.getElementById(`cur-m-${id}`);
        if (curM) curM.textContent = `${val.toFixed(1)}%`;
        const meterBar = document.getElementById(`meter-bar-${id}`);
        if (meterBar) meterBar.style.transform = `scaleX(${Math.min(1, val / 50)})`;

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

        this.logTelemetry('WARN', `${r.name} probe state toggled ${r.sensorFailed ? 'OFFLINE (FAO-56 Imputation Active)' : 'ONLINE'}.`);
        this.recomputeAll();
      });
    });
  }

  bindEvents() {
    // Monitored Area Input
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

    // Reservoir Inputs
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

    if (this.dom.resSlider) {
      this.dom.resSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setReservoirAvailable(val, false);
        this.recomputeAll();
      });
    }

    // Atmospheric Manual Override Sliders
    this.dom.sliderRain?.addEventListener('input', (e) => {
      this.weather.rainForecastMm = parseFloat(e.target.value);
      if (this.dom.valRain) this.dom.valRain.textContent = `${this.weather.rainForecastMm} mm`;
      this.recomputeAll();
    });

    this.dom.sliderTemp?.addEventListener('input', (e) => {
      this.weather.temperatureC = parseFloat(e.target.value);
      if (this.dom.valTemp) this.dom.valTemp.textContent = `${this.weather.temperatureC} °C`;
      this.recalculateAtmosphericVariables();
      this.recomputeAll();
    });

    this.dom.sliderHumidity?.addEventListener('input', (e) => {
      this.weather.humidityPct = parseFloat(e.target.value);
      if (this.dom.valHumidity) this.dom.valHumidity.textContent = `${this.weather.humidityPct} %`;
      this.recalculateAtmosphericVariables();
      this.recomputeAll();
    });

    this.dom.sliderWind?.addEventListener('input', (e) => {
      this.weather.windSpeedKmh = parseFloat(e.target.value);
      if (this.dom.valWind) this.dom.valWind.textContent = `${this.weather.windSpeedKmh} km/h`;
      this.recalculateAtmosphericVariables();
      this.recomputeAll();
    });

    document.querySelectorAll('.chips button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.res, 10);
        this.setReservoirAvailable(val, true);
        this.recomputeAll();
      });
    });

    document.getElementById('btn-sound-toggle')?.addEventListener('click', (e) => {
      this.sound.enabled = !this.sound.enabled;
      e.target.textContent = this.sound.enabled ? '🔊' : '🔇';
    });

    document.getElementById('btn-run')?.addEventListener('click', () => this.executeIrrigationCycle());

    document.getElementById('btn-fail-all')?.addEventListener('click', () => {
      const anyHealthy = this.regions.some(r => !r.sensorFailed);
      this.regions.forEach(r => { r.sensorFailed = anyHealthy; });
      this.renderZones();
      this.logTelemetry('WARN', `Global telemetry fault toggle: all sensors set to ${anyHealthy ? 'FAULT' : 'OPERATIONAL'}.`);
      this.recomputeAll();
    });

    document.getElementById('btn-evap')?.addEventListener('click', () => {
      this.simulateAutonomousDailyEvaporation();
    });

    // Location search
    document.getElementById('btn-search')?.addEventListener('click', () => {
      const query = document.getElementById('location-input')?.value;
      if (query) this.searchLocation(query);
    });

    document.getElementById('location-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value;
        if (query) this.searchLocation(query);
      }
    });

    document.getElementById('btn-location')?.addEventListener('click', () => this.getGeolocation());

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

  recalculateAtmosphericVariables() {
    // Vapor Pressure Deficit calculation
    const es = 0.6108 * Math.exp((17.27 * this.weather.temperatureC) / (this.weather.temperatureC + 237.3));
    const ea = es * (this.weather.humidityPct / 100);
    this.weather.vpd = Math.max(0.1, Math.round((es - ea) * 10) / 10);

    // Approximate FAO-56 Penman-Monteith ET0 shift when weather sliders are manually dragged
    const tempFactor = (this.weather.temperatureC / 30);
    const windFactor = 1 + (this.weather.windSpeedKmh / 60);
    const vpdFactor = (this.weather.vpd / 1.4);
    this.weather.et0 = Math.max(1.0, Math.round((4.5 * tempFactor * windFactor * vpdFactor * 0.5) * 10) / 10);
  }

  simulateAutonomousDailyEvaporation() {
    this.regions.forEach(r => {
      const prof = SOIL_PROFILES[r.soilType];
      const dailyLoss = (r.etc * 0.45) * prof.retentionMultiplier;
      r.currentMoisture = Math.max(prof.wiltingPoint - 1, Math.round((r.currentMoisture - dailyLoss) * 10) / 10);

      const curEl = document.getElementById(`cur-m-${r.id}`);
      if (curEl) curEl.textContent = `${r.currentMoisture.toFixed(1)}%`;
      const barEl = document.getElementById(`meter-bar-${r.id}`);
      if (barEl) barEl.style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
      const sliderEl = document.getElementById(`slider-moisture-${r.id}`);
      if (sliderEl) sliderEl.value = r.currentMoisture;
      const moistLabel = document.getElementById(`val-moisture-label-${r.id}`);
      if (moistLabel) moistLabel.textContent = `${r.currentMoisture.toFixed(1)}%`;
    });

    this.logTelemetry('ACTION', `Day advanced: Simulated depletion via local ET₀ (${this.weather.et0} mm) and crop transpiration.`);
    this.recomputeAll();
  }

  async searchLocation(query) {
    try {
      this.logTelemetry('SYSTEM', `Geocoding lookup for: "${query}"...`);
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=4`);
      const data = await res.json();
      const resultsDiv = document.getElementById('location-results');
      if (!resultsDiv) return;
      resultsDiv.innerHTML = '';

      if (data.results && data.results.length > 0) {
        data.results.forEach(loc => {
          const chip = document.createElement('div');
          chip.className = 'location-chip';
          const label = `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}, ${loc.country || ''}`;
          chip.textContent = label;
          chip.onclick = () => {
            document.getElementById('location-input').value = label;
            resultsDiv.innerHTML = '';
            this.coords = { lat: loc.latitude, lon: loc.longitude };
            this.currentLocationName = label;
            this.fetchWeather(loc.latitude, loc.longitude, label);
          };
          resultsDiv.appendChild(chip);
        });

        const top = data.results[0];
        const topLabel = `${top.name}${top.admin1 ? ', ' + top.admin1 : ''}, ${top.country || ''}`;
        this.coords = { lat: top.latitude, lon: top.longitude };
        this.currentLocationName = topLabel;
        this.fetchWeather(top.latitude, top.longitude, topLabel);
      } else {
        this.logTelemetry('WARN', `Location "${query}" not found.`);
      }
    } catch (e) {
      this.logTelemetry('WARN', `Geocoding network error: ${e.message}`);
    }
  }

  getGeolocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const label = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
          document.getElementById('location-input').value = label;
          this.coords = { lat, lon };
          this.currentLocationName = label;
          this.fetchWeather(lat, lon, label);
        },
        () => this.logTelemetry('WARN', 'GPS permission denied. Using default coordinates.')
      );
    }
  }

  async fetchWeather(lat, lon, locationLabel) {
    try {
      const statusPill = document.getElementById('api-status');
      if (statusPill) statusPill.innerHTML = '<span class="pulse-dot"></span><span>SYNCING TELEMETRY...</span>';

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max&current_weather=true&hourly=relativehumidity_2m&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.weather.rainForecastMm = data.daily?.precipitation_sum?.[0] ?? 0;
      this.weather.temperatureC = data.current_weather?.temperature ?? 28;
      this.weather.windSpeedKmh = data.current_weather?.windspeed ?? 10;
      this.weather.humidityPct = data.hourly?.relativehumidity_2m?.[0] ?? 50;
      this.weather.et0 = data.daily?.et0_fao_evapotranspiration?.[0] ?? 4.5;

      // Sync sliders with fetched weather
      if (this.dom.sliderRain) this.dom.sliderRain.value = this.weather.rainForecastMm;
      if (this.dom.sliderTemp) this.dom.sliderTemp.value = this.weather.temperatureC;
      if (this.dom.sliderHumidity) this.dom.sliderHumidity.value = this.weather.humidityPct;
      if (this.dom.sliderWind) this.dom.sliderWind.value = this.weather.windSpeedKmh;

      if (this.dom.valRain) this.dom.valRain.textContent = `${this.weather.rainForecastMm} mm`;
      if (this.dom.valTemp) this.dom.valTemp.textContent = `${this.weather.temperatureC} °C`;
      if (this.dom.valHumidity) this.dom.valHumidity.textContent = `${this.weather.humidityPct} %`;
      if (this.dom.valWind) this.dom.valWind.textContent = `${this.weather.windSpeedKmh} km/h`;

      if (data.daily?.time && data.daily?.et0_fao_evapotranspiration) {
        this.weather.forecastDays = data.daily.time.slice(0, 5).map(t => {
          const d = new Date(t);
          return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
        });
        this.weather.forecastET0 = data.daily.et0_fao_evapotranspiration.slice(0, 5);
      }

      this.recalculateAtmosphericVariables();

      // Dynamic moisture update per sector
      this.regions.forEach(r => {
        const prof = SOIL_PROFILES[r.soilType];
        const dryingFactor = (this.weather.vpd * 0.4) + (this.weather.et0 * 0.15);
        const naturalRainInfiltration = (this.weather.rainForecastMm * 0.35);

        let adjusted = r.targetMoisture - (dryingFactor * prof.retentionMultiplier * 4) + naturalRainInfiltration;
        r.currentMoisture = Math.max(prof.wiltingPoint, Math.min(prof.fieldCapacity, Math.round(adjusted * 10) / 10));

        const curEl = document.getElementById(`cur-m-${r.id}`);
        if (curEl) curEl.textContent = `${r.currentMoisture.toFixed(1)}%`;
        const barEl = document.getElementById(`meter-bar-${r.id}`);
        if (barEl) barEl.style.transform = `scaleX(${Math.min(1, r.currentMoisture / 50)})`;
        const sliderEl = document.getElementById(`slider-moisture-${r.id}`);
        if (sliderEl) sliderEl.value = r.currentMoisture;
        const moistLabel = document.getElementById(`val-moisture-label-${r.id}`);
        if (moistLabel) moistLabel.textContent = `${r.currentMoisture.toFixed(1)}%`;
      });

      if (statusPill) statusPill.innerHTML = '<span class="pulse-dot"></span><span>WEATHER: OPEN-METEO LIVE</span>';
      this.logTelemetry('SYSTEM', `Telemetry synchronized for ${locationLabel}: ET₀=${this.weather.et0} mm/d, Rain=${this.weather.rainForecastMm} mm, Temp=${this.weather.temperatureC}°C, RH=${this.weather.humidityPct}%.`);

      this.recomputeAll();
      this.updateForecastChart();
    } catch (err) {
      this.logTelemetry('WARN', `Failed to fetch weather telemetry: ${err.message}. Using cached state.`);
      this.recomputeAll();
    }
  }

  recomputeAll() {
    let totalDemand = 0;

    this.regions.forEach(r => {
      const kc = CROP_STAGES[r.stage].kc;
      r.etc = Math.round((this.weather.et0 * kc) * 10) / 10;
      r.deficit = Math.max(0, Math.round((r.targetMoisture - r.currentMoisture) * 10) / 10);

      const deficitLiters = r.deficit * r.kFactor * 100;
      r.etcLiters = Math.round(r.etc * this.quadrantArea * 10000);

      if (r.deficit > 0) {
        r.waterRequired = Math.round(deficitLiters + (r.etcLiters * 0.5));
      } else {
        r.waterRequired = 0;
      }

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
        reason: 'Soil water content is satisfied across monitored sectors.',
        waterSaved: 0
      };
    } else if (rain >= 5) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // RAINFALL GATED',
        reason: `Weather forecast predicts ${rain} mm rainfall. Natural precipitation satisfies root zone.`,
        waterSaved: totalDemand
      };
    } else if (hum >= 80 && rain >= 2) {
      this.dispatchStatus = {
        type: 'DELAYED',
        title: 'IRRIGATION DELAYED // HIGH HUMIDITY & DRIZZLE',
        reason: `Relative humidity (${hum}%) and drizzle minimizes crop transpiration.`,
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
        <b class="${r.sensorFailed ? 'sensor-fail' : 'sensor-ok'}">${r.sensorFailed ? 'FAULT // ET Model' : 'HEALTHY // In-Situ'}</b>
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

    this.updateComparisonChart();
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
          const sliderEl = document.getElementById(`slider-moisture-${r.id}`);
          if (sliderEl) sliderEl.value = r.currentMoisture;
          const moistLabel = document.getElementById(`val-moisture-label-${r.id}`);
          if (moistLabel) moistLabel.textContent = `${r.currentMoisture.toFixed(1)}%`;
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
    this.updateComparisonChart();
    this.updateForecastChart();
  }

  updateComparisonChart() {
    if (typeof Plotly === 'undefined' || !document.getElementById('comparison-chart')) return;

    const dynamicValues = this.regions.map(r => (r.waterAllocated / 1000000));
    const fixedValues = this.regions.map(() => ((this.quadrantArea * 50000) / 1000000));

    const compData = [
      {
        x: ['Sector A', 'Sector B', 'Sector C', 'Sector D'],
        y: dynamicValues,
        name: 'Precision Controller',
        type: 'bar',
        marker: { color: '#1b5e38' }
      },
      {
        x: ['Sector A', 'Sector B', 'Sector C', 'Sector D'],
        y: fixedValues,
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

    Plotly.react('comparison-chart', compData, compLayout, { responsive: true, displayModeBar: false });
  }

  updateForecastChart() {
    if (typeof Plotly === 'undefined' || !document.getElementById('forecast-chart')) return;

    const foreData = [{
      x: this.weather.forecastDays,
      y: this.weather.forecastET0,
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

    Plotly.react('forecast-chart', foreData, foreLayout, { responsive: true, displayModeBar: false });
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
