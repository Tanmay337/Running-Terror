/**
 * ArgiFlow™ // Dynamic Precision Irrigation + Live Weather Engine
 * Location → Weather → FAO-56 ET₀ → Crop ETc → Soil Stress → Demand → Reservoir
 */

const SOIL_PROFILES = {
  clay: {
    name: 'Clay Soil',
    defaultTarget: 36,
    wiltingPoint: 22,
    kMin: 130,
    kMax: 170,
    droughtVulnerability: 0.85
  },

  sandy: {
    name: 'Sandy Soil',
    defaultTarget: 18,
    wiltingPoint: 7,
    kMin: 65,
    kMax: 95,
    droughtVulnerability: 1.45
  },

  loamy: {
    name: 'Loamy Soil',
    defaultTarget: 28,
    wiltingPoint: 13,
    kMin: 95,
    kMax: 135,
    droughtVulnerability: 1.00
  },

  silt_loam: {
    name: 'Silt Loam',
    defaultTarget: 32,
    wiltingPoint: 15,
    kMin: 110,
    kMax: 150,
    droughtVulnerability: 0.95
  },

  peaty: {
    name: 'Peaty / Org',
    defaultTarget: 42,
    wiltingPoint: 24,
    kMin: 140,
    kMax: 190,
    droughtVulnerability: 0.80
  }
};


/* =========================================================
   CROP COEFFICIENTS
   ========================================================= */

const CROP_KC = {
  'Soybeans': {
    initial: 0.40,
    mid: 1.15,
    late: 0.50
  },

  'Maize / Corn': {
    initial: 0.30,
    mid: 1.20,
    late: 0.60
  },

  'Winter Wheat': {
    initial: 0.35,
    mid: 1.15,
    late: 0.40
  },

  'Sunflowers': {
    initial: 0.35,
    mid: 1.15,
    late: 0.35
  }
};


/* =========================================================
   AUDIO
   ========================================================= */

class AudioController {

  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {

    if (
      !this.ctx &&
      (window.AudioContext || window.webkitAudioContext)
    ) {

      const AudioCtx =
        window.AudioContext ||
        window.webkitAudioContext;

      this.ctx = new AudioCtx();
    }
  }

  playTone(
    freq,
    type = 'sine',
    duration = 0.12,
    vol = 0.06
  ) {

    if (!this.enabled) return;

    try {

      this.init();

      if (!this.ctx) return;

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc =
        this.ctx.createOscillator();

      const gain =
        this.ctx.createGain();

      osc.type = type;

      osc.frequency.setValueAtTime(
        freq,
        this.ctx.currentTime
      );

      gain.gain.setValueAtTime(
        vol,
        this.ctx.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.ctx.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();

      osc.stop(
        this.ctx.currentTime + duration
      );

    } catch (_) {}
  }

  playWaterSprinkler() {

    if (!this.enabled) return;

    try {

      this.init();

      if (!this.ctx) return;

      const n =
        Math.floor(
          this.ctx.sampleRate * 0.25
        );

      const buffer =
        this.ctx.createBuffer(
          1,
          n,
          this.ctx.sampleRate
        );

      const out =
        buffer.getChannelData(0);

      for (let i = 0; i < n; i++) {

        out[i] =
          (Math.random() * 2 - 1) * 0.05;

      }

      const noise =
        this.ctx.createBufferSource();

      const gain =
        this.ctx.createGain();

      noise.buffer = buffer;

      gain.gain.setValueAtTime(
        0.08,
        this.ctx.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + 0.25
      );

      noise.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();

    } catch (_) {}
  }
}


/* =========================================================
   MAIN APPLICATION
   ========================================================= */

class IrrigationControllerApp {

  constructor() {

    this.sound =
      new AudioController();


    /* -----------------------------------------------------
       FIELD ZONES
       ----------------------------------------------------- */

    this.regions = [

      {
        id: 1,
        letter: 'A',
        name: 'Sector Alpha',
        quadrant: 'NW',
        crop: 'Soybeans',
        soilType: 'clay',

        targetMoisture: 36,
        currentMoisture: 23,

        kFactor: 145,

        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,

        kc: 1.15,
        ks: 1,
        etc: 0,
        weatherFactor: 1
      },

      {
        id: 2,
        letter: 'B',
        name: 'Sector Beta',
        quadrant: 'NE',
        crop: 'Maize / Corn',
        soilType: 'sandy',

        targetMoisture: 18,
        currentMoisture: 10,

        kFactor: 78,

        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,

        kc: 1.20,
        ks: 1,
        etc: 0,
        weatherFactor: 1
      },

      {
        id: 3,
        letter: 'C',
        name: 'Sector Gamma',
        quadrant: 'SW',
        crop: 'Winter Wheat',
        soilType: 'loamy',

        targetMoisture: 28,
        currentMoisture: 17,

        kFactor: 112,

        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,

        kc: 1.15,
        ks: 1,
        etc: 0,
        weatherFactor: 1
      },

      {
        id: 4,
        letter: 'D',
        name: 'Sector Delta',
        quadrant: 'SE',
        crop: 'Sunflowers',
        soilType: 'silt_loam',

        targetMoisture: 32,
        currentMoisture: 21,

        kFactor: 126,

        deficit: 0,
        waterRequired: 0,
        waterAllocated: 0,

        kc: 1.15,
        ks: 1,
        etc: 0,
        weatherFactor: 1
      }

    ];


    /* -----------------------------------------------------
       WEATHER STATE
       ----------------------------------------------------- */

    this.weather = {

      rainForecastMm: 0,

      humidityPct: 32,

      temperatureC: 31,

      windSpeedKmh: 10,

      solarRadiation: null,

      et0: 4.5,

      source: 'manual',

      location: null

    };


    this.reservoir = {

      maxCapacity: 15000,

      waterAvailable: 6000

    };


    this.optimizationStrategy =
      'smart_vulnerability';


    this.dispatchStatus = {

      type: 'INSTANT',

      title:
        'INSTANT IRRIGATION AUTHORIZED',

      reason: '',

      waterSaved: 0

    };


    this.isSimulating = false;

    this.dom = {};

    this.weatherRequestId = 0;
  }


  /* =======================================================
     INITIALIZATION
     ======================================================= */

  init() {

    this.cacheStaticDOM();

    this.randomizeAllKFactors(false);

    this.renderQuadrantsOnce();

    this.bindEvents();

    this.updateWeatherUI();

    this.recomputeAll();

    this.logTelemetry(
      'SYSTEM',
      'ArgiFlow live weather engine active.'
    );

    this.logTelemetry(
      'SYSTEM',
      'Select a location to load live weather.'
    );
  }


  /* =======================================================
     DOM CACHE
     ======================================================= */

  cacheStaticDOM() {

    const ids = [

      'kpi-total-demand',
      'kpi-avg-deficit',

      'kpi-water-reserved',
      'kpi-reserve-ratio',

      'kpi-dispatch-badge',
      'kpi-dispatch-reason',

      'aerial-total-water',
      'aerial-fulfillment-pct',

      'weather-decision-card',
      'decision-title',
      'decision-desc',
      'decision-badge',

      'decision-status-icon',

      'dec-rain-gate',
      'dec-humid-gate',
      'dec-savings',

      'tank-fill-bar',
      'tank-demand-marker',

      'shortage-status-badge',

      'slider-reservoir',
      'reservoir-val-text',

      'allocation-table-body',

      'sum-demanded',
      'sum-allocated',
      'sum-unmet',

      'terminal-logs-body',

      'location-search',
      'btn-location-search',
      'btn-use-location',
      'location-results',
      'selected-location',

      'weather-source-status',

      'live-et0',
      'live-etc',
      'live-weather-factor',

      'slider-rain',
      'slider-humidity',
      'slider-temp',

      'val-rain-mm',
      'val-humidity',
      'val-temperature',

      'weather-preset-select'
    ];


    ids.forEach(id => {

      this.dom[id] =
        document.getElementById(id);

    });
  }


  /* =======================================================
     K FACTOR
     ======================================================= */

  generateRandomK(soilType) {

    const p =
      SOIL_PROFILES[soilType] ||
      SOIL_PROFILES.loamy;

    return Math.round(
      p.kMin +
      Math.random() *
      (p.kMax - p.kMin)
    );
  }


  randomizeAllKFactors(log = true) {

    this.regions.forEach(region => {

      region.kFactor =
        this.generateRandomK(
          region.soilType
        );

    });


    if (log) {

      this.regions.forEach(region => {

        if (
          this.dom[`kVal_${region.id}`]
        ) {

          this.dom[
            `kVal_${region.id}`
          ].textContent =
            `${region.kFactor} L/%`;

        }

      });

      this.logTelemetry(
        'SYSTEM',
        'Hydrology K-factors re-calibrated.'
      );

      this.sound.playTone(520);
    }
  }


  /* =======================================================
     EVENTS
     ======================================================= */

  bindEvents() {

    const soundToggle =
      document.getElementById(
        'btn-sound-toggle'
      );


    soundToggle?.addEventListener(
      'click',
      () => {

        this.sound.enabled =
          !this.sound.enabled;

        document
          .getElementById('sound-icon-on')
          ?.classList.toggle(
            'hidden',
            !this.sound.enabled
          );

        document
          .getElementById('sound-icon-off')
          ?.classList.toggle(
            'hidden',
            this.sound.enabled
          );

      }
    );


    document
      .getElementById('btn-quick-randomize')
      ?.addEventListener(
        'click',
        () => this.randomizeScenario()
      );


    document
      .getElementById('btn-reroll-k')
      ?.addEventListener(
        'click',
        () => {

          this.randomizeAllKFactors(true);

          this.recomputeAll();

        }
      );


    document
      .getElementById('btn-run-simulation')
      ?.addEventListener(
        'click',
        () => this.executeIrrigationCycle()
      );


    document
      .getElementById('btn-evaporate-day')
      ?.addEventListener(
        'click',
        () => {

          const loss =
            Math.max(
              1,
              this.weather.et0 * 0.55
            );

          this.regions.forEach(region => {

            region.currentMoisture =
              Math.max(
                2,
                Math.round(
                  (
                    region.currentMoisture -
                    loss
                  ) * 10
                ) / 10
              );

          });


          this.logTelemetry(
            'ACTION',
            `Daily ET loss applied using ET₀ ${this.weather.et0.toFixed(2)} mm/day.`
          );


          this.sound.playTone(
            330,
            'sawtooth',
            0.15
          );


          this.recomputeAll();

        }
      );


    /* Reservoir */

    this.dom.sliderReservoir
      ?.addEventListener(
        'input',
        event => {

          this.reservoir.waterAvailable =
            parseInt(
              event.target.value,
              10
            );

          this.dom.reservoirValText.textContent =
            this.reservoir.waterAvailable
              .toLocaleString();

          this.recomputeAll();

        }
      );


    document
      .querySelectorAll('.chip-btn')
      .forEach(button => {

        button.addEventListener(
          'click',
          event => {

            const value =
              parseInt(
                event.currentTarget.dataset.val,
                10
              );

            this.reservoir.waterAvailable =
              value;

            if (
              this.dom.sliderReservoir
            ) {

              this.dom.sliderReservoir.value =
                value;

            }

            this.dom.reservoirValText.textContent =
              value.toLocaleString();

            this.recomputeAll();

          }
        );

      });


    /* Optimization */

    document
      .getElementById('select-opt-strategy')
      ?.addEventListener(
        'change',
        event => {

          this.optimizationStrategy =
            event.target.value;

          const desc =
            document.getElementById(
              'opt-strategy-desc'
            );

          if (desc) {

            if (
              this.optimizationStrategy ===
              'smart_vulnerability'
            ) {

              desc.innerHTML =
                '<strong>Smart Vulnerability:</strong> Prioritizes deficit using soil drought vulnerability.';

            }

            else if (
              this.optimizationStrategy ===
              'proportional'
            ) {

              desc.innerHTML =
                '<strong>Proportional Deficit Rationing:</strong> Scales each zone against total demand.';

            }

            else {

              desc.innerHTML =
                '<strong>Wilting Triage:</strong> Satisfies the highest-deficit zones first.';

            }

          }

          this.recomputeAll();

        }
      );


    /* Logs */

    document
      .getElementById('btn-clear-logs')
      ?.addEventListener(
        'click',
        () => {

          if (
            this.dom['terminal-logs-body']
          ) {

            this.dom[
              'terminal-logs-body'
            ].innerHTML = `

              <div class="log-entry log-sys">

                <span class="log-time">
                  [${new Date().toLocaleTimeString()}]
                </span>

                <span class="log-msg">
                  Logs cleared.
                </span>

              </div>

            `;

          }

        }
      );


    /* -----------------------------------------------------
       MANUAL WEATHER
       ----------------------------------------------------- */

    this.dom['slider-rain']
      ?.addEventListener(
        'input',
        event => {

          this.weather.rainForecastMm =
            parseFloat(
              event.target.value
            ) || 0;

          this.weather.source =
            'manual';

          this.weather.et0 =
            this.estimateET0();

          this.updateWeatherUI();

          this.recomputeAll();

        }
      );


    this.dom['slider-humidity']
      ?.addEventListener(
        'input',
        event => {

          this.weather.humidityPct =
            parseFloat(
              event.target.value
            ) || 0;

          this.weather.source =
            'manual';

          this.weather.et0 =
            this.estimateET0();

          this.updateWeatherUI();

          this.recomputeAll();

        }
      );


    this.dom['slider-temp']
      ?.addEventListener(
        'input',
        event => {

          this.weather.temperatureC =
            parseFloat(
              event.target.value
            ) || 0;

          this.weather.source =
            'manual';

          this.weather.et0 =
            this.estimateET0();

          this.updateWeatherUI();

          this.recomputeAll();

        }
      );


    this.dom['weather-preset-select']
      ?.addEventListener(
        'change',
        event =>
          this.applyWeatherPreset(
            event.target.value
          )
      );


    /* -----------------------------------------------------
       LOCATION SEARCH
       ----------------------------------------------------- */

    this.dom['btn-location-search']
      ?.addEventListener(
        'click',
        () => this.searchLocations()
      );


    this.dom['location-search']
      ?.addEventListener(
        'keydown',
        event => {

          if (event.key === 'Enter') {

            this.searchLocations();

          }

        }
      );


    this.dom['btn-use-location']
      ?.addEventListener(
        'click',
        () => this.useGPSLocation()
      );
  }


  /* =======================================================
     LOCATION SEARCH
     ======================================================= */

  async searchLocations() {

    const query =
      this.dom['location-search']
        ?.value
        .trim();


    if (!query) return;


    const box =
      this.dom['location-results'];


    if (box) {

      box.classList.remove('hidden');

      box.innerHTML =
        '<div class="location-result">Searching…</div>';

    }


    try {

      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;


      const response =
        await fetch(url);


      if (!response.ok) {

        throw new Error(
          'Geocoding request failed'
        );

      }


      const data =
        await response.json();


      const results =
        data.results || [];


      if (!results.length) {

        box.innerHTML =
          '<div class="location-result">No locations found.</div>';

        return;

      }


      box.innerHTML = '';


      results.forEach(place => {

        const button =
          document.createElement('button');


        button.type = 'button';

        button.className =
          'location-result';


        button.textContent =
          `${place.name}${
            place.admin1
              ? ', ' + place.admin1
              : ''
          }${
            place.country
              ? ', ' + place.country
              : ''
          }`;


        button.addEventListener(
          'click',
          () => {

            box.classList.add('hidden');


            this.selectLocation({

              name: place.name,

              admin1: place.admin1,

              country: place.country,

              latitude: place.latitude,

              longitude: place.longitude

            });

          }
        );


        box.appendChild(button);

      });


    }

    catch (error) {

      if (box) {

        box.innerHTML =
          '<div class="location-result">Location search failed. Check your internet connection.</div>';

      }


      this.logTelemetry(
        'WARN',
        'Location search failed.'
      );

    }

  }


  /* =======================================================
     GPS
     ======================================================= */

  useGPSLocation() {

    if (!navigator.geolocation) {

      this.logTelemetry(
        'WARN',
        'Browser geolocation is unavailable.'
      );

      return;

    }


    this.setWeatherSourceStatus(
      'Locating…',
      'loading'
    );


    navigator.geolocation.getCurrentPosition(

      position => {

        this.selectLocation({

          name: 'Current GPS location',

          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude

        });

      },


      () => {

        this.setWeatherSourceStatus(
          'GPS unavailable — manual',
          'manual'
        );


        this.logTelemetry(
          'WARN',
          'GPS permission/location unavailable. Use location search.'
        );

      },


      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }

    );

  }


  /* =======================================================
     LIVE WEATHER
     ======================================================= */

  async selectLocation(location) {

    this.weather.location =
      location;


    this.setWeatherSourceStatus(
      'Loading live weather…',
      'loading'
    );


    if (this.dom['selected-location']) {

      this.dom[
        'selected-location'
      ].textContent =
        `${location.name}${
          location.admin1
            ? ', ' + location.admin1
            : ''
        }${
          location.country
            ? ', ' + location.country
            : ''
        }`;

    }


    const requestId =
      ++this.weatherRequestId;


    try {

      const params =
        new URLSearchParams({

          latitude:
            location.latitude,

          longitude:
            location.longitude,

          current:
            'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,shortwave_radiation',

          daily:
            'et0_fao_evapotranspiration,precipitation_sum',

          timezone:
            'auto',

          forecast_days:
            '2'

        });


      const response =
        await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`
        );


      if (!response.ok) {

        throw new Error(
          'Weather request failed'
        );

      }


      const data =
        await response.json();


      if (
        requestId !==
        this.weatherRequestId
      ) {

        return;

      }


      const current =
        data.current || {};


      const daily =
        data.daily || {};


      /* ---------------------------------------------------
         IMPORTANT:
         USE CURRENT HUMIDITY FROM SELECTED LOCATION
         --------------------------------------------------- */

      const temperature =
        Number(
          current.temperature_2m
        );


      const humidity =
        Number(
          current.relative_humidity_2m
        );


      const currentRain =
        Number(
          current.precipitation
        );


      const dailyRain =
        Number(
          daily.precipitation_sum?.[0]
        );


      const et0 =
        Number(
          daily.et0_fao_evapotranspiration?.[0]
        );


      const wind =
        Number(
          current.wind_speed_10m
        );


      const solar =
        Number(
          current.shortwave_radiation
        );


      if (
        Number.isFinite(temperature)
      ) {

        this.weather.temperatureC =
          temperature;

      }


      if (
        Number.isFinite(humidity)
      ) {

        this.weather.humidityPct =
          humidity;

      }


      if (
        Number.isFinite(wind)
      ) {

        this.weather.windSpeedKmh =
          wind;

      }


      if (
        Number.isFinite(solar)
      ) {

        this.weather.solarRadiation =
          solar;

      }


      /*
       * Daily precipitation is used because
       * irrigation decision concerns forecast rainfall.
       */

      if (
        Number.isFinite(dailyRain)
      ) {

        this.weather.rainForecastMm =
          dailyRain;

      }

      else if (
        Number.isFinite(currentRain)
      ) {

        this.weather.rainForecastMm =
          currentRain;

      }


      if (
        Number.isFinite(et0)
      ) {

        this.weather.et0 =
          et0;

      }

      else {

        this.weather.et0 =
          this.estimateET0();

      }


      this.weather.source =
        'open-meteo';


      /*
       * THIS IS THE IMPORTANT PART.
       * Update sliders + labels AFTER location changes.
       */

      this.updateWeatherUI();


      /*
       * Demand is recalculated AFTER
       * humidity, temperature, rain and ET₀
       * have been updated.
       */

      this.recomputeAll();


      this.logTelemetry(
        'WEATHER',

        `Live weather loaded for ${
          location.name
        }: ${
          this.weather.temperatureC.toFixed(1)
        }°C, ${
          this.weather.humidityPct.toFixed(0)
        }% RH, ${
          this.weather.rainForecastMm.toFixed(1)
        }mm rain, ET₀ ${
          this.weather.et0.toFixed(2)
        }mm/day.`
      );


      this.setWeatherSourceStatus(
        '● Live Open-Meteo',
        'live'
      );

    }


    catch (error) {

      this.weather.source =
        'manual';


      this.weather.et0 =
        this.estimateET0();


      this.updateWeatherUI();

      this.recomputeAll();


      this.setWeatherSourceStatus(
        '● API failed — manual',
        'manual'
      );


      this.logTelemetry(
        'WARN',
        `Weather API failed for ${location.name}; using fallback weather model.`
      );

    }

  }


  /* =======================================================
     FALLBACK ET₀
     ======================================================= */

  estimateET0() {

    const temperature =
      this.weather.temperatureC;

    const humidity =
      this.weather.humidityPct;

    const wind =
      this.weather.windSpeedKmh;


    const dryAirFactor =
      Math.max(
        0.2,
        1 - humidity / 100
      );


    return Math.max(

      0.8,

      Math.min(

        9,

        0.9 +

        0.16 *
        Math.max(
          0,
          temperature - 10
        ) +

        0.015 *
        wind +

        1.8 *
        dryAirFactor

      )

    );

  }


  /* =======================================================
     WEATHER STATUS
     ======================================================= */

  setWeatherSourceStatus(
    text,
    mode
  ) {

    if (
      !this.dom['weather-source-status']
    ) return;


    this.dom[
      'weather-source-status'
    ].textContent = text;


    this.dom[
      'weather-source-status'
    ].className =
      `weather-source-${mode}`;

  }


  /* =======================================================
     WEATHER UI
     ======================================================= */

  updateWeatherUI() {

    const rain =
      Math.max(
        0,
        Math.min(
          35,
          Number(this.weather.rainForecastMm) || 0
        )
      );


    const humidity =
      Math.max(
        15,
        Math.min(
          100,
          Number(this.weather.humidityPct) || 0
        )
      );


    const temperature =
      Math.max(
        10,
        Math.min(
          45,
          Number(this.weather.temperatureC) || 0
        )
      );


    this.weather.rainForecastMm =
      rain;

    this.weather.humidityPct =
      humidity;

    this.weather.temperatureC =
      temperature;


    /* Slider values */

    if (
      this.dom['slider-rain']
    ) {

      this.dom[
        'slider-rain'
      ].value = rain;

    }


    if (
      this.dom['slider-humidity']
    ) {

      this.dom[
        'slider-humidity'
      ].value = humidity;

    }


    if (
      this.dom['slider-temp']
    ) {

      this.dom[
        'slider-temp'
      ].value = temperature;

    }


    /* Visible values */

    if (
      this.dom['val-rain-mm']
    ) {

      this.dom[
        'val-rain-mm'
      ].textContent =
        `${rain.toFixed(1)} mm`;

    }


    if (
      this.dom['val-humidity']
    ) {

      this.dom[
        'val-humidity'
      ].textContent =
        `${humidity.toFixed(0)}%`;

    }


    if (
      this.dom['val-temperature']
    ) {

      this.dom[
        'val-temperature'
      ].textContent =
        `${temperature.toFixed(1)} °C`;

    }


    if (
      this.dom['live-et0']
    ) {

      this.dom[
        'live-et0'
      ].textContent =
        `${this.weather.et0.toFixed(2)} mm/day`;

    }


    if (
      this.dom['weather-preset-select'] &&
      this.weather.source === 'open-meteo'
    ) {

      this.dom[
        'weather-preset-select'
      ].value = 'custom';

    }

  }


  /* =======================================================
     WEATHER PRESETS
     ======================================================= */

  applyWeatherPreset(key) {

    if (
      key === 'sunny_dry'
    ) {

      this.weather.rainForecastMm = 0;
      this.weather.humidityPct = 26;
      this.weather.temperatureC = 34;

    }

    else if (
      key === 'mild_opt'
    ) {

      this.weather.rainForecastMm = 0;
      this.weather.humidityPct = 52;
      this.weather.temperatureC = 23;

    }

    else if (
      key === 'storm_incoming'
    ) {

      this.weather.rainForecastMm = 18;
      this.weather.humidityPct = 91;
      this.weather.temperatureC = 20;

    }

    else if (
      key === 'humid_fog'
    ) {

      this.weather.rainForecastMm = 1;
      this.weather.humidityPct = 88;
      this.weather.temperatureC = 19;

    }

    else if (
      key === 'light_drizzle'
    ) {

      this.weather.rainForecastMm = 4;
      this.weather.humidityPct = 82;
      this.weather.temperatureC = 21;

    }

    else {

      return;

    }


    this.weather.source =
      'manual';


    this.weather.et0 =
      this.estimateET0();


    this.setWeatherSourceStatus(
      '● Manual preset',
      'manual'
    );


    this.updateWeatherUI();

    this.recomputeAll();

  }


  /* =======================================================
     QUADRANTS
     ======================================================= */

  renderQuadrantsOnce() {

    const container =
      document.getElementById(
        'quadrants-container'
      );


    if (!container) return;


    container.innerHTML = '';


    const fragment =
      document.createDocumentFragment();


    this.regions.forEach(region => {

      const card =
        document.createElement('div');


      card.className =
        'quadrant-card';


      card.id =
        `quadrant-card-${region.id}`;


      card.innerHTML = `

        <div class="sprinkler-overlay"
             id="sprinkler-${region.id}">

          <div class="water-droplets"></div>

        </div>


        <div class="quadrant-top">

          <div class="quadrant-id-group">

            <div class="quadrant-letter">
              ${region.letter}
            </div>

            <div class="quadrant-title-info">

              <span class="quadrant-name">
                ${region.name}
                (${region.quadrant})
              </span>

              <span class="quadrant-area-tag">
                AREA: 25 HA (EQUAL 25%)
              </span>

            </div>

          </div>


          <span class="crop-badge">
            ${region.crop}
          </span>

        </div>


        <div class="soil-config-row">

          <div class="form-group">

            <label class="form-label">
              Soil Type
            </label>

            <select
              id="soil-select-${region.id}"
              class="form-select select-sm soil-picker"
              data-id="${region.id}"
            >

              <option
                value="clay"
                ${region.soilType === 'clay' ? 'selected' : ''}
              >
                Clay (~36%)
              </option>

              <option
                value="sandy"
                ${region.soilType === 'sandy' ? 'selected' : ''}
              >
                Sandy (~18%)
              </option>

              <option
                value="loamy"
                ${region.soilType === 'loamy' ? 'selected' : ''}
              >
                Loamy (~28%)
              </option>

              <option
                value="silt_loam"
                ${region.soilType === 'silt_loam' ? 'selected' : ''}
              >
                Silt Loam (~32%)
              </option>

              <option
                value="peaty"
                ${region.soilType === 'peaty' ? 'selected' : ''}
              >
                Peaty (~42%)
              </option>

            </select>

          </div>


          <div class="form-group">

            <label class="form-label">

              Target

              <span
                class="text-cyan font-mono"
                id="target-label-${region.id}"
              >
                ${region.targetMoisture}%
              </span>

            </label>


            <input
              type="number"
              id="target-input-${region.id}"
              min="5"
              max="55"
              step="1"
              value="${region.targetMoisture}"
              class="form-input select-sm target-num-input"
              data-id="${region.id}"
            >

          </div>

        </div>


        <div class="k-pill">

          <span class="k-pill-title">
            K (L/1% ΔM):
          </span>

          <div
            style="
              display:flex;
              align-items:center;
              gap:6px
            "
          >

            <span
              class="k-pill-val"
              id="k-val-${region.id}"
            >
              ${region.kFactor} L/%
            </span>

            <button
              class="btn btn-xs btn-outline btn-reroll-single"
              data-id="${region.id}"
            >
              ↺
            </button>

          </div>

        </div>


        <div class="moisture-block">

          <div class="moisture-header-row">

            <span class="control-label">
              Moisture
            </span>

            <div class="moisture-readouts">

              <span>
                Cur:

                <strong
                  class="val-current"
                  id="cur-val-${region.id}"
                >
                  ${region.currentMoisture}%
                </strong>

              </span>

              <span>

                Tgt:

                <span
                  class="val-target"
                  id="tgt-disp-${region.id}"
                >
                  ${region.targetMoisture}%
                </span>

              </span>

            </div>

          </div>


          <div class="moisture-meter-container">

            <div
              class="moisture-bar-current"
              id="bar-cur-${region.id}"
            ></div>

            <div
              class="moisture-target-indicator"
              id="ind-tgt-${region.id}"
            ></div>

          </div>


          <input
            type="range"
            min="0"
            max="55"
            step="0.5"
            value="${region.currentMoisture}"
            class="moisture-slider-input"
            data-id="${region.id}"
            id="slider-cur-${region.id}"
          >

        </div>


        <div class="quadrant-bottom">

          <div class="stat-item">

            <span class="stat-title">
              Deficit:
            </span>

            <span
              class="stat-val-deficit"
              id="deficit-val-${region.id}"
            >
              0.0%
            </span>

          </div>


          <div class="stat-item">

            <span class="stat-title">
              Required:
            </span>

            <span
              class="stat-val-water"
              id="water-req-${region.id}"
            >
              0 L
            </span>

          </div>

        </div>

      `;


      fragment.appendChild(card);

    });


    container.appendChild(fragment);


    this.regions.forEach(region => {

      this.dom[
        `card_${region.id}`
      ] =
        document.getElementById(
          `quadrant-card-${region.id}`
        );


      this.dom[
        `curVal_${region.id}`
      ] =
        document.getElementById(
          `cur-val-${region.id}`
        );


      this.dom[
        `tgtDisp_${region.id}`
      ] =
        document.getElementById(
          `tgt-disp-${region.id}`
        );


      this.dom[
        `tgtLabel_${region.id}`
      ] =
        document.getElementById(
          `target-label-${region.id}`
        );


      this.dom[
        `tgtInput_${region.id}`
      ] =
        document.getElementById(
          `target-input-${region.id}`
        );


      this.dom[
        `kVal_${region.id}`
      ] =
        document.getElementById(
          `k-val-${region.id}`
        );


      this.dom[
        `barCur_${region.id}`
      ] =
        document.getElementById(
          `bar-cur-${region.id}`
        );


      this.dom[
        `indTgt_${region.id}`
      ] =
        document.getElementById(
          `ind-tgt-${region.id}`
        );


      this.dom[
        `deficitVal_${region.id}`
      ] =
        document.getElementById(
          `deficit-val-${region.id}`
        );


      this.dom[
        `waterReq_${region.id}`
      ] =
        document.getElementById(
          `water-req-${region.id}`
        );


      this.dom[
        `sliderCur_${region.id}`
      ] =
        document.getElementById(
          `slider-cur-${region.id}`
        );

    });


    this.bindQuadrantInputs();

  }


  bindQuadrantInputs() {

    document
      .querySelectorAll('.soil-picker')
      .forEach(select => {

        select.addEventListener(
          'change',
          event => {

            const id =
              parseInt(
                event.target.dataset.id,
                10
              );


            const region =
              this.regions.find(
                r => r.id === id
              );


            const profile =
              SOIL_PROFILES[
                event.target.value
              ];


            region.soilType =
              event.target.value;


            region.targetMoisture =
              profile.defaultTarget;


            region.kFactor =
              this.generateRandomK(
                region.soilType
              );


            this.dom[
              `tgtInput_${id}`
            ].value =
              region.targetMoisture;


            this.dom[
              `tgtLabel_${id}`
            ].textContent =
              `${region.targetMoisture}%`;


            this.dom[
              `tgtDisp_${id}`
            ].textContent =
              `${region.targetMoisture}%`;


            this.dom[
              `kVal_${id}`
            ].textContent =
              `${region.kFactor} L/%`;


            this.recomputeAll();

          }
        );

      });


    document
      .querySelectorAll('.target-num-input')
      .forEach(input => {

        input.addEventListener(
          'input',
          event => {

            const id =
              parseInt(
                event.target.dataset.id,
                10
              );


            const region =
              this.regions.find(
                r => r.id === id
              );


            const value =
              Math.max(
                0,
                Math.min(
                  55,
                  parseFloat(
                    event.target.value
                  ) || 0
                )
              );


            region.targetMoisture =
              value;


            this.dom[
              `tgtLabel_${id}`
            ].textContent =
              `${value}%`;


            this.dom[
              `tgtDisp_${id}`
            ].textContent =
              `${value}%`;


            this.recomputeAll();

          }
        );

      });


    document
      .querySelectorAll('.moisture-slider-input')
      .forEach(slider => {

        slider.addEventListener(
          'input',
          event => {

            const id =
              parseInt(
                event.target.dataset.id,
                10
              );


            const region =
              this.regions.find(
                r => r.id === id
              );


            region.currentMoisture =
              parseFloat(
                event.target.value
              ) || 0;


            this.dom[
              `curVal_${id}`
            ].textContent =
              `${region.currentMoisture.toFixed(1)}%`;


            this.recomputeAll();

          }
        );

      });


    document
      .querySelectorAll('.btn-reroll-single')
      .forEach(button => {

        button.addEventListener(
          'click',
          event => {

            event.stopPropagation();


            const id =
              parseInt(
                event.currentTarget.dataset.id,
                10
              );


            const region =
              this.regions.find(
                r => r.id === id
              );


            region.kFactor =
              this.generateRandomK(
                region.soilType
              );


            this.dom[
              `kVal_${id}`
            ].textContent =
              `${region.kFactor} L/%`;


            this.recomputeAll();

          }
        );

      });

  }


  /* =======================================================
     AGRONOMIC CALCULATIONS
     ======================================================= */

  getCropKc(region) {

    const crop =
      CROP_KC[region.crop] ||
      CROP_KC['Soybeans'];


    return crop.mid;

  }


  getSoilStress(region) {

    const profile =
      SOIL_PROFILES[
        region.soilType
      ];


    const availableRange =
      Math.max(
        1,
        region.targetMoisture -
        profile.wiltingPoint
      );


    const relative =
      Math.max(
        0,
        Math.min(
          1,
          (
            region.currentMoisture -
            profile.wiltingPoint
          ) /
          availableRange
        )
      );


    /*
     * Demo root-zone stress factor.
     *
     * Never lets the value become zero,
     * because plants still have atmospheric demand.
     */

    return Math.max(
      0.25,
      Math.min(
        1,
        relative
      )
    );

  }


  calculateZoneDemand(region) {

    const et0 =
      Math.max(
        0.1,
        this.weather.et0 ||
        this.estimateET0()
      );


    const kc =
      this.getCropKc(region);


    const ks =
      this.getSoilStress(region);


    /*
     * Crop evapotranspiration:
     *
     * ETc = ET₀ × Kc × Ks
     */

    const etc =
      et0 *
      kc *
      ks;


    region.kc = kc;

    region.ks = ks;

    region.etc = etc;


    /*
     * Convert atmospheric demand into
     * a calibrated zone-demand multiplier.
     *
     * This keeps the existing K-factor useful.
     */

    const etFactor =
      Math.max(
        0.55,
        Math.min(
          1.65,
          etc / 4.5
        )
      );


    /*
     * Rain credit:
     *
     * More rain forecast =
     * less irrigation demand.
     */

    const rainCredit =
      Math.max(
        0.35,
        1 -
        Math.min(
          0.65,
          this.weather.rainForecastMm / 20
        )
      );


    /*
     * Humidity factor:
     *
     * High humidity lowers atmospheric demand.
     * Low humidity increases it.
     */

    const humidityFactor =
      Math.max(
        0.85,
        Math.min(
          1.10,
          1 +
          (
            50 -
            this.weather.humidityPct
          ) / 500
        )
      );


    const weatherFactor =
      Math.max(
        0.40,
        Math.min(
          1.70,
          etFactor *
          rainCredit *
          humidityFactor
        )
      );


    region.weatherFactor =
      weatherFactor;


    /*
     * BASE WATER DEMAND
     *
     * Deficit × K
     */

    const baseDemand =
      region.deficit *
      region.kFactor;


    /*
     * FINAL DYNAMIC DEMAND
     *
     * Base × Weather Factor
     */

    region.waterRequired =
      Math.round(
        baseDemand *
        weatherFactor
      );


    return region.waterRequired;

  }


  /* =======================================================
     MASTER RECALCULATION
     ======================================================= */

  recomputeAll() {

    let totalDemand = 0;

    let totalDeficit = 0;

    let totalEtc = 0;


    for (
      const region of this.regions
    ) {

      region.deficit =
        Math.max(
          0,
          Math.round(
            (
              region.targetMoisture -
              region.currentMoisture
            ) * 10
          ) / 10
        );


      totalDeficit +=
        region.deficit;


      totalDemand +=
        this.calculateZoneDemand(
          region
        );


      totalEtc +=
        region.etc || 0;

    }


    if (
      !Number.isFinite(
        this.weather.et0
      )
    ) {

      this.weather.et0 =
        this.estimateET0();

    }


    const avgEtc =
      totalEtc /
      this.regions.length;


    const avgFactor =
      this.regions.reduce(
        (sum, region) =>
          sum +
          (
            region.weatherFactor ||
            1
          ),
        0
      ) /
      this.regions.length;


    if (
      this.dom['live-et0']
    ) {

      this.dom[
        'live-et0'
      ].textContent =
        `${this.weather.et0.toFixed(2)} mm/day`;

    }


    if (
      this.dom['live-etc']
    ) {

      this.dom[
        'live-etc'
      ].textContent =
        `${avgEtc.toFixed(2)} mm/day`;

    }


    if (
      this.dom['live-weather-factor']
    ) {

      this.dom[
        'live-weather-factor'
      ].textContent =
        `${avgFactor.toFixed(2)}×`;

    }


    /*
     * IMPORTANT:
     *
     * Demand is already recalculated
     * before weather evaluation.
     */

    this.evaluateWeather(
      totalDemand
    );


    this.optimizeAllocation(
      totalDemand
    );


    this.renderFastDOM(
      totalDemand,
      (
        totalDeficit / 4
      ).toFixed(1)
    );

  }


  /* =======================================================
     WEATHER GATING
     ======================================================= */

  evaluateWeather(totalDemand) {

    const rain =
      this.weather.rainForecastMm;

    const humidity =
      this.weather.humidityPct;


    if (
      totalDemand === 0
    ) {

      this.dispatchStatus = {

        type: 'STANDBY',

        title:
          'STANDBY // OPTIMAL MOISTURE',

        reason:
          'Field moisture is at capacity.',

        waterSaved: 0

      };

    }


    else if (
      rain >= 5
    ) {

      this.dispatchStatus = {

        type: 'DELAYED',

        title:
          'IRRIGATION DELAYED // RAIN PREDICTED',

        reason:
          `Forecast indicates ${rain.toFixed(
            1
          )}mm precipitation. Preserving reservoir water.`,

        waterSaved:
          totalDemand

      };

    }


    else if (
      humidity >= 80 &&
      rain >= 2
    ) {

      this.dispatchStatus = {

        type: 'DELAYED',

        title:
          'IRRIGATION DELAYED // HUMID + DRIZZLE',

        reason:
          `High humidity (${humidity.toFixed(
            0
          )}%) and rainfall reduce atmospheric demand.`,

        waterSaved:
          totalDemand

      };

    }


    else {

      this.dispatchStatus = {

        type: 'INSTANT',

        title:
          'INSTANT IRRIGATION AUTHORIZED',

        reason:
          `Weather demand active: ET₀ ${
            this.weather.et0.toFixed(2)
          }mm/day, ${
            humidity.toFixed(0)
          }% RH, ${
            rain.toFixed(1)
          }mm rain.`,

        waterSaved: 0

      };

    }

  }


  /* =======================================================
     RESERVOIR OPTIMIZATION
     ======================================================= */

  optimizeAllocation(totalDemand) {

    const available =
      this.reservoir.waterAvailable;


    if (
      available >= totalDemand ||
      totalDemand === 0
    ) {

      this.regions.forEach(
        region => {

          region.waterAllocated =
            region.waterRequired;

        }
      );

      return;

    }


    if (
      this.optimizationStrategy ===
      'proportional'
    ) {

      const scale =
        available /
        totalDemand;


      this.regions.forEach(
        region => {

          region.waterAllocated =
            Math.floor(
              region.waterRequired *
              scale
            );

        }
      );

      return;

    }


    if (
      this.optimizationStrategy ===
      'triage_critical'
    ) {

      const sorted =
        [...this.regions].sort(
          (a, b) =>
            b.deficit -
            a.deficit
        );


      let pool =
        available;


      this.regions.forEach(
        region => {

          region.waterAllocated =
            0;

        }
      );


      sorted.forEach(
        selected => {

          const region =
            this.regions.find(
              r =>
                r.id ===
                selected.id
            );


          const take =
            Math.min(
              pool,
              region.waterRequired
            );


          region.waterAllocated =
            take;


          pool -= take;

        }
      );


      return;

    }


    /*
     * Smart vulnerability
     */

    let totalWeight = 0;

    const weights = [];


    this.regions.forEach(
      region => {

        const weight =
          region.deficit *
          SOIL_PROFILES[
            region.soilType
          ].droughtVulnerability;


        weights.push(weight);

        totalWeight +=
          weight;

      }
    );


    this.regions.forEach(
      (region, index) => {

        region.waterAllocated =
          totalWeight

            ? Math.min(
                region.waterRequired,

                Math.floor(
                  (
                    weights[index] /
                    totalWeight
                  ) *
                  available
                )
              )

            : 0;

      }
    );

  }


  /* =======================================================
     RENDER
     ======================================================= */

  renderFastDOM(
    totalDemand,
    avgDeficit
  ) {

    this.dom[
      'kpi-total-demand'
    ].textContent =
      totalDemand.toLocaleString();


    this.dom[
      'kpi-avg-deficit'
    ].textContent =
      `Avg Deficit: ${avgDeficit}%`;


    const available =
      this.reservoir.waterAvailable;


    const coverage =
      totalDemand > 0

        ? Math.min(
            100,
            Math.round(
              (
                available /
                totalDemand
              ) * 100
            )
          )

        : 100;


    this.dom[
      'kpi-water-reserved'
    ].textContent =
      available.toLocaleString();


    this.dom[
      'kpi-reserve-ratio'
    ].textContent =
      `Coverage: ${coverage}%`;


    this.dom[
      'kpi-dispatch-badge'
    ].textContent =
      this.dispatchStatus.type;


    this.dom[
      'kpi-dispatch-badge'
    ].className =
      `badge-status badge-${
        this.dispatchStatus.type.toLowerCase()
      }`;


    this.dom[
      'kpi-dispatch-reason'
    ].textContent =
      this.dispatchStatus.type ===
      'INSTANT'

        ? 'Weather window active'

        : 'Weather gate active';


    this.dom[
      'aerial-total-water'
    ].textContent =
      `${totalDemand.toLocaleString()} L`;


    this.dom[
      'aerial-fulfillment-pct'
    ].textContent =
      `${coverage}%`;


    /* Zones */

    this.regions.forEach(
      region => {

        const ratio =
          Math.min(
            1,
            region.currentMoisture /
            55
          );


        const target =
          Math.min(
            1,
            region.targetMoisture /
            55
          );


        this.dom[
          `barCur_${region.id}`
        ].style.transform =
          `scaleX(${ratio})`;


        this.dom[
          `indTgt_${region.id}`
        ].style.left =
          `${target * 100}%`;


        this.dom[
          `deficitVal_${region.id}`
        ].textContent =
          `${region.deficit.toFixed(1)}%`;


        this.dom[
          `waterReq_${region.id}`
        ].textContent =
          `${region.waterRequired.toLocaleString()} L`;


        this.dom[
          `card_${region.id}`
        ].classList.toggle(
          'stressed',
          region.deficit >= 12
        );

      }
    );


    /* Weather decision */

    this.dom[
      'decision-title'
    ].textContent =
      this.dispatchStatus.title;


    this.dom[
      'decision-desc'
    ].textContent =
      this.dispatchStatus.reason;


    this.dom[
      'decision-badge'
    ].textContent =
      this.dispatchStatus.type;


    this.dom[
      'decision-badge'
    ].className =
      `badge-status badge-${
        this.dispatchStatus.type.toLowerCase()
      }`;


    this.dom[
      'weather-decision-card'
    ].className =
      `weather-decision-banner ${
        this.dispatchStatus.type ===
        'DELAYED'
          ? 'delayed-active'
          : ''
      }`;


    this.dom[
      'dec-rain-gate'
    ].textContent =
      `${this.weather.rainForecastMm.toFixed(1)} mm`;


    this.dom[
      'dec-humid-gate'
    ].textContent =
      `${this.weather.humidityPct.toFixed(0)}% RH`;


    this.dom[
      'dec-savings'
    ].textContent =
      `${this.dispatchStatus.waterSaved.toLocaleString()} L`;


    /* Reservoir */

    const tankRatio =
      Math.min(
        1,
        available /
        this.reservoir.maxCapacity
      );


    const demandRatio =
      Math.min(
        1,
        totalDemand /
        this.reservoir.maxCapacity
      );


    this.dom[
      'tank-fill-bar'
    ].style.transform =
      `scaleX(${tankRatio})`;


    this.dom[
      'tank-demand-marker'
    ].style.left =
      `${demandRatio * 100}%`;


    if (
      available >= totalDemand
    ) {

      this.dom[
        'shortage-status-badge'
      ].textContent =
        `SURPLUS (+${
          (
            available -
            totalDemand
          ).toLocaleString()
        } L)`;


      this.dom[
        'shortage-status-badge'
      ].className =
        'badge-status badge-balanced';

    }

    else {

      this.dom[
        'shortage-status-badge'
      ].textContent =
        `SHORTAGE (-${
          (
            totalDemand -
            available
          ).toLocaleString()
        } L)`;


      this.dom[
        'shortage-status-badge'
      ].className =
        'badge-status badge-deficit';

    }


    /* Allocation table */

    let allocatedTotal = 0;

    let html = '';


    this.regions.forEach(
      region => {

        allocatedTotal +=
          region.waterAllocated;


        const percentage =
          region.waterRequired

            ? Math.round(
                (
                  region.waterAllocated /
                  region.waterRequired
                ) * 100
              )

            : 100;


        html += `

          <tr>

            <td>
              <strong>
                ${region.letter}
              </strong>
              -
              ${region.name}
            </td>

            <td>
              ${
                SOIL_PROFILES[
                  region.soilType
                ].name
              }
            </td>

            <td>
              ${region.deficit.toFixed(1)}%
            </td>

            <td>
              ${region.waterRequired.toLocaleString()} L
            </td>

            <td>
              <strong>
                ${region.waterAllocated.toLocaleString()} L
              </strong>
            </td>

            <td>

              <div class="opt-prog-wrap">

                <div class="opt-prog-bar">

                  <div
                    class="opt-prog-fill ${
                      percentage < 100
                        ? 'short'
                        : ''
                    }"
                    style="
                      transform:
                        scaleX(
                          ${percentage / 100}
                        )
                    "
                  ></div>

                </div>

                <span class="opt-prog-pct">
                  ${percentage}%
                </span>

              </div>

            </td>

          </tr>

        `;

      }
    );


    this.dom[
      'allocation-table-body'
    ].innerHTML =
      html;


    this.dom[
      'sum-demanded'
    ].textContent =
      `${totalDemand.toLocaleString()} L`;


    this.dom[
      'sum-allocated'
    ].textContent =
      `${allocatedTotal.toLocaleString()} L`;


    this.dom[
      'sum-unmet'
    ].textContent =
      `${Math.max(
        0,
        totalDemand -
        allocatedTotal
      ).toLocaleString()} L`;

  }


  /* =======================================================
     IRRIGATION EXECUTION
     ======================================================= */

  executeIrrigationCycle() {

    if (this.isSimulating) return;


    if (
      this.dispatchStatus.type ===
      'DELAYED'
    ) {

      this.sound.playTone(
        220,
        'sawtooth',
        0.2
      );


      alert(
        `[AGRIFLOW ADVISORY]

Irrigation DELAYED by Weather Gating.

${this.dispatchStatus.reason}`
      );


      return;

    }


    const total =
      this.regions.reduce(
        (sum, region) =>
          sum +
          region.waterAllocated,
        0
      );


    if (!total) return;


    this.isSimulating = true;


    const button =
      document.getElementById(
        'btn-run-simulation'
      );


    if (button) {

      button.disabled = true;

      button.textContent =
        'Irrigating...';

    }


    this.regions.forEach(
      region => {

        if (
          region.waterAllocated > 0
        ) {

          this.dom[
            `card_${region.id}`
          ].classList.add(
            'irrigating'
          );

        }

      }
    );


    this.sound.playWaterSprinkler();


    this.logTelemetry(
      'ACTION',
      `Dispensing ${total.toLocaleString()} L across sectors.`
    );


    const duration =
      2000;


    const start =
      performance.now();


    const startingMoisture =
      this.regions.map(
        region =>
          region.currentMoisture
      );


    const startingReservoir =
      this.reservoir.waterAvailable;


    const animate =
      now => {

        const progress =
          Math.min(
            1,
            (
              now -
              start
            ) /
            duration
          );


        this.regions.forEach(
          (region, index) => {

            if (
              region.waterAllocated > 0
            ) {

              const lift =
                region.waterAllocated /
                region.kFactor;


              region.currentMoisture =
                Math.min(

                  region.targetMoisture,

                  Math.round(

                    (
                      startingMoisture[
                        index
                      ] +

                      lift *
                      progress

                    ) * 10

                  ) / 10

                );


              this.dom[
                `curVal_${region.id}`
              ].textContent =
                `${region.currentMoisture.toFixed(1)}%`;


              this.dom[
                `sliderCur_${region.id}`
              ].value =
                region.currentMoisture;

            }

          }
        );


        this.reservoir.waterAvailable =
          Math.max(
            0,
            Math.round(
              startingReservoir -
              total *
              progress
            )
          );


        this.dom[
          'reservoir-val-text'
        ].textContent =
          this.reservoir.waterAvailable
            .toLocaleString();


        this.dom[
          'slider-reservoir'
        ].value =
          this.reservoir.waterAvailable;


        this.recomputeAll();


        if (
          progress < 1
        ) {

          requestAnimationFrame(
            animate
          );

        }

        else {

          this.regions.forEach(
            region => {

              this.dom[
                `card_${region.id}`
              ].classList.remove(
                'irrigating'
              );

            }
          );


          this.isSimulating =
            false;


          if (button) {

            button.disabled =
              false;


            button.innerHTML = `

              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >

                <polygon
                  points="5 3 19 12 5 21 5 3"
                ></polygon>

              </svg>

              Execute Irrigation Cycle

            `;

          }


          this.logTelemetry(
            'ACTION',
            'Irrigation cycle complete. Reservoir updated.'
          );


          this.sound.playTone(
            880,
            'sine',
            0.2
          );

        }

      };


    requestAnimationFrame(
      animate
    );

  }


  /* =======================================================
     RANDOM SCENARIO
     ======================================================= */

  randomizeScenario() {

    const soilTypes =
      Object.keys(
        SOIL_PROFILES
      );


    this.regions.forEach(
      region => {

        region.soilType =
          soilTypes[
            Math.floor(
              Math.random() *
              soilTypes.length
            )
          ];


        const profile =
          SOIL_PROFILES[
            region.soilType
          ];


        region.targetMoisture =
          profile.defaultTarget;


        region.kFactor =
          this.generateRandomK(
            region.soilType
          );


        region.currentMoisture =
          Math.max(

            4,

            Math.round(

              (
                profile.wiltingPoint +

                Math.random() *
                (
                  profile.defaultTarget -
                  profile.wiltingPoint
                )

              ) * 10

            ) / 10

          );


        document
          .getElementById(
            `soil-select-${region.id}`
          )
          .value =
          region.soilType;


        this.dom[
          `tgtInput_${region.id}`
        ].value =
          region.targetMoisture;


        this.dom[
          `tgtLabel_${region.id}`
        ].textContent =
          `${region.targetMoisture}%`;


        this.dom[
          `tgtDisp_${region.id}`
        ].textContent =
          `${region.targetMoisture}%`;


        this.dom[
          `curVal_${region.id}`
        ].textContent =
          `${region.currentMoisture.toFixed(1)}%`;


        this.dom[
          `sliderCur_${region.id}`
        ].value =
          region.currentMoisture;


        this.dom[
          `kVal_${region.id}`
        ].textContent =
          `${region.kFactor} L/%`;

      }
    );


    const modes = [

      'sunny_dry',

      'mild_opt',

      'storm_incoming',

      'light_drizzle'

    ];


    this.applyWeatherPreset(

      modes[
        Math.floor(
          Math.random() *
          modes.length
        )
      ]

    );


    const reservoirLevels = [

      2500,

      4500,

      7500,

      11000

    ];


    this.reservoir.waterAvailable =

      reservoirLevels[
        Math.floor(
          Math.random() *
          reservoirLevels.length
        )
      ];


    this.dom[
      'slider-reservoir'
    ].value =
      this.reservoir.waterAvailable;


    this.dom[
      'reservoir-val-text'
    ].textContent =
      this.reservoir.waterAvailable
        .toLocaleString();


    this.recomputeAll();


    this.logTelemetry(
      'SYSTEM',
      'Random scenario initialized.'
    );


    this.sound.playTone(660);

  }


  /* =======================================================
     TELEMETRY
     ======================================================= */

  logTelemetry(
    type,
    message
  ) {

    if (
      !this.dom[
        'terminal-logs-body'
      ]
    ) return;


    const entry =
      document.createElement(
        'div'
      );


    entry.className =
      `log-entry log-${type.toLowerCase()}`;


    entry.innerHTML = `

      <span class="log-time">

        [
        ${new Date().toLocaleTimeString()}
        ]

      </span>

      <span class="log-msg">

        ${message}

      </span>

    `;


    this.dom[
      'terminal-logs-body'
    ].appendChild(
      entry
    );


    this.dom[
      'terminal-logs-body'
    ].scrollTop =
      this.dom[
        'terminal-logs-body'
      ].scrollHeight;

  }

}


/* =========================================================
   START APPLICATION
   ========================================================= */

window.addEventListener(
  'DOMContentLoaded',
  () => {

    window.argiFlow =
      new IrrigationControllerApp();

    window.argiFlow.init();

  }
);
