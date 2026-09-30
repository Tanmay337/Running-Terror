/*
  ArgiFlow™
  Dynamic Precision Irrigation Controller

  MVP:
  - 4 irrigation zones
  - Simulated soil sensors
  - Open-Meteo weather
  - Location search
  - FAO-56 ET0
  - Crop stage + Kc
  - Nonlinear soil model
  - Weather gating
  - Reservoir optimization
  - Fixed schedule comparison
  - Plotly charts
  - Sensor failure fallback

  IMPORTANT:
  Soil sensors are simulated for the hackathon MVP.
*/


/* =========================================================
   SOIL PROFILES
========================================================= */

const SOILS = {

  clay: {
    name: "Clay",
    thetaFC: 36,
    wp: 22,
    root: 0.75,
    vulnerability: 0.85,
    nonlinear: 0.82
  },

  sandy: {
    name: "Sandy",
    thetaFC: 18,
    wp: 7,
    root: 0.55,
    vulnerability: 1.45,
    nonlinear: 1.18
  },

  loamy: {
    name: "Loamy",
    thetaFC: 28,
    wp: 13,
    root: 0.65,
    vulnerability: 1.00,
    nonlinear: 1.00
  },

  silt_loam: {
    name: "Silt Loam",
    thetaFC: 32,
    wp: 15,
    root: 0.70,
    vulnerability: 0.95,
    nonlinear: 0.90
  },

  peaty: {
    name: "Peaty",
    thetaFC: 42,
    wp: 24,
    root: 0.65,
    vulnerability: 0.80,
    nonlinear: 0.78
  }

};


/* =========================================================
   CROP DATA
========================================================= */

const CROPS = {

  maize: {
    name: "Maize / Corn",
    kc: {
      initial: 0.30,
      development: 0.90,
      mid: 1.20,
      late: 0.60
    }
  },

  soybean: {
    name: "Soybeans",
    kc: {
      initial: 0.40,
      development: 0.85,
      mid: 1.15,
      late: 0.50
    }
  },

  wheat: {
    name: "Winter Wheat",
    kc: {
      initial: 0.30,
      development: 0.85,
      mid: 1.15,
      late: 0.40
    }
  },

  sunflower: {
    name: "Sunflowers",
    kc: {
      initial: 0.35,
      development: 0.80,
      mid: 1.15,
      late: 0.35
    }
  }

};


const STAGES = [
  "initial",
  "development",
  "mid",
  "late"
];


const STAGE_LABEL = {

  initial: "Initial",

  development: "Development",

  mid: "Mid-season",

  late: "Late-season"

};


/* =========================================================
   GLOBAL STATE
========================================================= */

const state = {

  location: {
    name: "Jaipur, India",
    lat: 26.9124,
    lon: 75.7873
  },

  weather: {

    live: false,

    rain: 0,

    temperature: 30,

    humidity: 45,

    wind: 2,

    et0: 4,

    vpd: 1.2,

    forecast: []

  },

  reservoir: 15000000,

  strategy: "smart",

  sound: true,

  simulating: false,

  allSensorsFailed: false,

  regions: [

    {
      id: 1,
      letter: "A",
      name: "Sector Alpha",
      quadrant: "NW",
      crop: "soybean",
      soil: "clay",
      stage: "development",
      moisture: 25,
      sensorOk: true,
      lastGood: 25
    },

    {
      id: 2,
      letter: "B",
      name: "Sector Beta",
      quadrant: "NE",
      crop: "maize",
      soil: "sandy",
      stage: "mid",
      moisture: 11,
      sensorOk: true,
      lastGood: 11
    },

    {
      id: 3,
      letter: "C",
      name: "Sector Gamma",
      quadrant: "SW",
      crop: "wheat",
      soil: "loamy",
      stage: "mid",
      moisture: 18,
      sensorOk: true,
      lastGood: 18
    },

    {
      id: 4,
      letter: "D",
      name: "Sector Delta",
      quadrant: "SE",
      crop: "sunflower",
      soil: "silt_loam",
      stage: "development",
      moisture: 22,
      sensorOk: true,
      lastGood: 22
    }

  ]

};


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);


function fmt(value) {

  return Number(value || 0)
    .toLocaleString(
      undefined,
      {
        maximumFractionDigits: 0
      }
    );

}


function f1(value) {

  return Number(value || 0)
    .toFixed(1);

}


function getRegion(id) {

  return state.regions.find(
    r => r.id == id
  );

}


/* =========================================================
   AUDIO
========================================================= */

function playTone(freq = 600) {

  if (!state.sound) return;

  try {

    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const osc =
      ctx.createOscillator();

    const gain =
      ctx.createGain();

    osc.frequency.value = freq;

    gain.gain.value = 0.025;

    osc.connect(gain);

    gain.connect(ctx.destination);

    osc.start();

    osc.stop(
      ctx.currentTime + 0.08
    );

  } catch (error) {}

}


/* =========================================================
   TELEMETRY
========================================================= */

function log(message, type = "SYSTEM") {

  const logs = $("logs");

  if (!logs) return;

  const row =
    document.createElement("div");

  row.textContent =
    `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;

  logs.appendChild(row);

  logs.scrollTop =
    logs.scrollHeight;

}


/* =========================================================
   CROP COEFFICIENT
========================================================= */

function getKc(region) {

  return CROPS[
    region.crop
  ].kc[
    region.stage
  ];

}


/* =========================================================
   NONLINEAR SOIL MODEL
========================================================= */

function nonlinearDeficit(region) {

  const soil =
    SOILS[region.soil];

  const raw =
    Math.max(
      0,
      soil.thetaFC -
      region.moisture
    );

  const availableWater =
    Math.max(
      1,
      soil.thetaFC -
      soil.wp
    );

  const normalized =
    Math.min(
      1,
      raw / availableWater
    );

  /*
    Nonlinear response.

    When moisture approaches
    the wilting region, the
    required corrective water
    rises faster.
  */

  const multiplier =
    Math.pow(
      0.72 +
      0.28 * normalized,
      soil.nonlinear
    );

  return raw * multiplier;

}


/* =========================================================
   FAO-56 STYLE WATER STRESS
========================================================= */

function getKs(region) {

  const soil =
    SOILS[region.soil];

  const available =
    Math.max(
      1,
      soil.thetaFC -
      soil.wp
    );

  const relativeWater =
    Math.max(
      0,
      Math.min(
        1,
        (region.moisture -
          soil.wp) /
        available
      )
    );

  /*
    Simplified FAO-56 style
    stress coefficient.

    Above approximately 55%
    available water:

    Ks ≈ 1

    Below that:

    Ks declines toward stress.
  */

  if (relativeWater >= 0.55) {

    return 1;

  }

  return Math.max(
    0.10,
    relativeWater / 0.55
  );

}


/* =========================================================
   ROOT ZONE WATER
========================================================= */

function rootZoneWater(region) {

  const soil =
    SOILS[region.soil];

  const deficit =
    nonlinearDeficit(region);

  /*
    25 hectares:

    25 ha =
    250,000 m²

    1 mm over 1 m² =
    1 litre
  */

  const areaM2 =
    250000;

  const deltaTheta =
    deficit / 100;

  return (
    deltaTheta *
    areaM2 *
    soil.root *
    1000
  );

}


/* =========================================================
   BUILD ZONE MODEL
========================================================= */

function buildZoneModel() {

  let totalDemand = 0;

  state.regions.forEach(region => {

    const soil =
      SOILS[region.soil];

    region.areaM2 =
      250000;

    region.target =
      soil.thetaFC;

    region.deficit =
      Math.max(
        0,
        region.target -
        region.moisture
      );

    region.ks =
      getKs(region);

    region.kc =
      getKc(region);

    /*
      Crop water requirement:

      ETc =
      ET0 × Kc × Ks
    */

    region.etc =
      state.weather.et0 *
      region.kc *
      region.ks;

    const etDemand =
      Math.max(
        0,
        region.etc *
        region.areaM2
      );

    const soilDemand =
      rootZoneWater(region);

    /*
      Blend daily atmospheric
      demand and soil deficit
      for the controller.
    */

    region.demand =
      Math.round(
        Math.max(
          etDemand * 0.65,
          soilDemand * 0.35
        )
      );

    totalDemand +=
      region.demand;

  });

  return totalDemand;

}


/* =========================================================
   WEATHER GATE
========================================================= */

function weatherGate(totalDemand) {

  const rain =
    state.weather.rain;

  const humidity =
    state.weather.humidity;


  if (totalDemand <= 0) {

    return {

      type: "STANDBY",

      title:
        "STANDBY // MOISTURE TARGET MET",

      reason:
        "No irrigation deficit detected.",

      saved: 0

    };

  }


  if (rain >= 5) {

    return {

      type: "DELAYED",

      title:
        "IRRIGATION DELAYED // RAIN PREDICTED",

      reason:
        `${f1(rain)} mm precipitation is forecast. Preserve reservoir water and reassess after the rain window.`,

      saved:
        totalDemand

    };

  }


  if (
    humidity > 80 &&
    rain >= 2
  ) {

    return {

      type: "DELAYED",

      title:
        "IRRIGATION DELAYED // HUMID + RAIN",

      reason:
        `High RH (${f1(humidity)}%) with ${f1(rain)} mm rain reduces immediate irrigation need.`,

      saved:
        totalDemand

    };

  }


  return {

    type: "INSTANT",

    title:
      "INSTANT IRRIGATION AUTHORIZED",

    reason:
      `Weather window is open: ${f1(rain)} mm rain and ${f1(humidity)}% RH.`,

    saved: 0

  };

}


/* =========================================================
   RESERVOIR OPTIMIZATION
========================================================= */

function allocateWater(totalDemand) {

  let pool =
    state.reservoir;


  state.regions.forEach(
    r => r.allocated = 0
  );


  if (
    totalDemand <= pool
  ) {

    state.regions.forEach(
      r =>
        r.allocated =
        r.demand
    );

    return;

  }


  /*
    PROPORTIONAL
  */

  if (
    state.strategy ===
    "proportional"
  ) {

    state.regions.forEach(
      r => {

        r.allocated =
          Math.floor(
            r.demand *
            pool /
            Math.max(
              1,
              totalDemand
            )
          );

      }
    );

    return;

  }


  /*
    CRITICAL TRIAGE
  */

  if (
    state.strategy ===
    "triage"
  ) {

    const sorted =
      [...state.regions]
        .sort(
          (a,b) =>
            b.deficit -
            a.deficit
        );


    sorted.forEach(region => {

      const amount =
        Math.min(
          pool,
          region.demand
        );

      region.allocated =
        amount;

      pool -= amount;

    });

    return;

  }


  /*
    SMART VULNERABILITY

    Weight:

    moisture deficit
    × soil vulnerability
    × water stress
  */

  const weights =
    state.regions.map(
      region =>

        region.deficit *
        SOILS[
          region.soil
        ].vulnerability *
        (
          1 +
          (1 - region.ks)
        )

    );


  const weightSum =
    weights.reduce(
      (a,b) => a + b,
      0
    );


  state.regions.forEach(
    (region,index) => {

      const share =
        weights[index] /
        Math.max(
          0.001,
          weightSum
        );

      region.allocated =
        Math.min(
          region.demand,
          Math.floor(
            pool * share
          )
        );

    }
  );

}


/* =========================================================
   RENDER ZONES
========================================================= */

function renderZones() {

  const container =
    $("zones");

  container.innerHTML = "";


  state.regions.forEach(
    region => {

      const soil =
        SOILS[
          region.soil
        ];

      const crop =
        CROPS[
          region.crop
        ];


      const card =
        document.createElement(
          "article"
        );


      card.className =
        `zone ${
          region.sensorOk
            ? ""
            : "failed"
        }`;


      card.id =
        `zone-${region.id}`;


      card.innerHTML = `

        <div class="zone-head">

          <div class="zone-name">

            <span class="zone-letter">
              ${region.letter}
            </span>

            <div>

              <div class="zone-title">
                ${region.name}
              </div>

              <div class="zone-meta">
                ${region.quadrant}
                • 25 ha
              </div>

            </div>

          </div>

          <span class="crop">
            ${crop.name}
          </span>

        </div>


        <div class="zone-controls">

          <div class="form-group">

            <label>

              Soil

              <select
                data-id="${region.id}"
                class="soil"
              >

                <option value="clay">
                  Clay
                </option>

                <option value="sandy">
                  Sandy
                </option>

                <option value="loamy">
                  Loamy
                </option>

                <option value="silt_loam">
                  Silt Loam
                </option>

                <option value="peaty">
                  Peaty
                </option>

              </select>

            </label>

          </div>


          <div class="form-group">

            <label>

              Crop stage

              <select
                data-id="${region.id}"
                class="stage"
              >

                ${STAGES.map(
                  stage => `
                    <option
                      value="${stage}"
                    >
                      ${STAGE_LABEL[stage]}
                    </option>
                  `
                ).join("")}

              </select>

            </label>

          </div>

        </div>


        <div class="zone-controls">

          <div class="form-group">

            <label>

              Crop

              <select
                data-id="${region.id}"
                class="crop-select"
              >

                <option value="soybean">
                  Soybean
                </option>

                <option value="maize">
                  Maize
                </option>

                <option value="wheat">
                  Winter Wheat
                </option>

                <option value="sunflower">
                  Sunflower
                </option>

              </select>

            </label>

          </div>


          <div class="form-group">

            <label>

              Sensor moisture

              <b id="mval-${region.id}">
                ${f1(region.moisture)}%
              </b>

              <input
                data-id="${region.id}"
                class="moisture-input"
                type="range"
                min="0"
                max="55"
                step=".5"
                value="${region.moisture}"
              >

            </label>

          </div>

        </div>


        <div class="sensor-line">

          <span>

            Sensor:

            <b
              class="${
                region.sensorOk
                  ? "sensor-ok"
                  : "sensor-fail"
              }"
            >

              ${
                region.sensorOk
                  ? "VALID"
                  : "FAILED → FALLBACK"
              }

            </b>

          </span>


          <button
            class="sensor-toggle"
            data-id="${region.id}"
          >

            ${
              region.sensorOk
                ? "Simulate failure"
                : "Restore sensor"
            }

          </button>

        </div>


        <div class="moisture">

          <div class="moisture-head">

            <span>
              Moisture
            </span>

            <span>
              ${f1(region.moisture)}%
              /
              ${soil.thetaFC}%
              target
            </span>

          </div>


          <div class="meter">

            <div
              id="meter-${region.id}"
              class="meter-current"
            ></div>

            <div
              id="target-${region.id}"
              class="meter-target"
            ></div>

          </div>

        </div>


        <div class="zone-stats">

          <div class="zone-stat">

            <span>
              Deficit
            </span>

            <b id="def-${region.id}">
              —
            </b>

          </div>


          <div class="zone-stat">

            <span>
              Kc
            </span>

            <b id="kc-${region.id}">
              —
            </b>

          </div>


          <div class="zone-stat">

            <span>
              ETc
            </span>

            <b id="etc-${region.id}">
              —
            </b>

          </div>


          <div class="zone-stat">

            <span>
              Demand
            </span>

            <b id="demand-${region.id}">
              —
            </b>

          </div>


          <div class="zone-stat">

            <span>
              Allocated
            </span>

            <b id="alloc-${region.id}">
              —
            </b>

          </div>


          <div class="zone-stat">

            <span>
              Ks
            </span>

            <b id="ks-${region.id}">
              —
            </b>

          </div>

        </div>

      `;


      container.appendChild(card);


      card.querySelector(
        ".soil"
      ).value =
        region.soil;


      card.querySelector(
        ".stage"
      ).value =
        region.stage;


      card.querySelector(
        ".crop-select"
      ).value =
        region.crop;

    });


  bindZoneEvents();

}


/* =========================================================
   ZONE EVENTS
========================================================= */

function bindZoneEvents() {


  document
    .querySelectorAll(".soil")
    .forEach(
      element => {

        element.onchange =
          event => {

            const region =
              getRegion(
                event.target.dataset.id
              );

            region.soil =
              event.target.value;

            render();

          };

      }
    );


  document
    .querySelectorAll(".stage")
    .forEach(
      element => {

        element.onchange =
          event => {

            const region =
              getRegion(
                event.target.dataset.id
              );

            region.stage =
              event.target.value;

            render();

          };

      }
    );


  document
    .querySelectorAll(".crop-select")
    .forEach(
      element => {

        element.onchange =
          event => {

            const region =
              getRegion(
                event.target.dataset.id
              );

            region.crop =
              event.target.value;

            render();

          };

      }
    );


  document
    .querySelectorAll(".moisture-input")
    .forEach(
      element => {

        element.oninput =
          event => {

            const region =
              getRegion(
                event.target.dataset.id
              );

            region.moisture =
              Number(
                event.target.value
              );

            region.lastGood =
              region.moisture;

            render();

          };

      }
    );


  document
    .querySelectorAll(".sensor-toggle")
    .forEach(
      element => {

        element.onclick =
          event => {

            const region =
              getRegion(
                event.target.dataset.id
              );


            region.sensorOk =
              !region.sensorOk;


            if (
              region.sensorOk
            ) {

              region.moisture =
                region.lastGood;

            }


            renderZones();

            render();


            log(
              `Sensor ${region.letter}: ${
                region.sensorOk
                  ? "restored"
                  : "failure injected; fallback estimator active"
              }`,
              "SENSOR"
            );

          };

      }
    );

}


/* =========================================================
   MAIN RENDER
========================================================= */

function render() {

  const total =
    buildZoneModel();


  const gate =
    weatherGate(
      total
    );


  state.gate =
    gate;


  allocateWater(
    total
  );


  const allocated =
    state.regions.reduce(
      (sum, region) =>
        sum + region.allocated,
      0
    );


  const coverage =
    total > 0
      ? Math.min(
          100,
          allocated / total * 100
        )
      : 100;


  /*
    KPI
  */

  $("kpi-et0").textContent =
    `${f1(state.weather.et0)} mm/day`;


  $("kpi-demand").textContent =
    `${fmt(total)} L`;


  $("kpi-reservoir").textContent =
    `${fmt(state.reservoir)} L`;


  $("kpi-coverage").textContent =
    `Allocation coverage ${f1(coverage)}%`;


  $("kpi-dispatch").textContent =
    gate.type;


  $("kpi-dispatch-reason").textContent =
    gate.type === "INSTANT"
      ? "Weather window open"
      : gate.type === "DELAYED"
        ? "Rain / humidity gate"
        : "No deficit";


  /*
    Weather
  */

  $("w-rain").textContent =
    `${f1(state.weather.rain)} mm`;

  $("w-temp").textContent =
    `${f1(state.weather.temperature)} °C`;

  $("w-rh").textContent =
    `${f1(state.weather.humidity)}%`;

  $("w-wind").textContent =
    `${f1(state.weather.wind)} km/h`;

  $("w-et0").textContent =
    `${f1(state.weather.et0)} mm`;

  $("w-vpd").textContent =
    `${f1(state.weather.vpd)} kPa`;


  /*
    Decision
  */

  $("decision-title").textContent =
    gate.title;

  $("decision-text").textContent =
    gate.reason;

  $("decision-badge").textContent =
    gate.type;


  $("decision-badge").className =
    `badge ${
      gate.type === "INSTANT" ||
      gate.type === "STANDBY"
        ? "success"
        : gate.type === "DELAYED"
          ? "warning"
          : "danger"
    }`;


  $("decision").className =
    `decision ${
      gate.type === "DELAYED"
        ? "delayed"
        : ""
    }`;


  /*
    Zones
  */

  state.regions.forEach(
    region => {

      const soil =
        SOILS[
          region.soil
        ];


      $(
        `mval-${region.id}`
      ).textContent =
        `${f1(region.moisture)}%`;


      $(
        `meter-${region.id}`
      ).style.transform =
        `scaleX(${
          Math.min(
            1,
            region.moisture / 55
          )
        })`;


      $(
        `target-${region.id}`
      ).style.left =
        `${
          Math.min(
            100,
            soil.thetaFC / 55 * 100
          )
        }%`;


      $(
        `def-${region.id}`
      ).textContent =
        `${f1(region.deficit)}%`;


      $(
        `kc-${region.id}`
      ).textContent =
        f1(region.kc);


      $(
        `etc-${region.id}`
      ).textContent =
        `${f1(region.etc)} mm`;


      $(
        `demand-${region.id}`
      ).textContent =
        `${fmt(region.demand)} L`;


      $(
        `alloc-${region.id}`
      ).textContent =
        `${fmt(region.allocated)} L`;


      $(
        `ks-${region.id}`
      ).textContent =
        f1(region.ks);

    });


  renderTable();

  renderSensorHealth();

  renderComparison(
    total,
    gate
  );

}


/* =========================================================
   ALLOCATION TABLE
========================================================= */

function renderTable() {

  $("allocation-body").innerHTML =

    state.regions
      .map(region => {

        const percentage =
          region.demand > 0
            ? Math.min(
                100,
                region.allocated /
                region.demand *
                100
              )
            : 100;


        return `

          <tr>

            <td>
              <b>
                ${region.letter}
              </b>
            </td>

            <td>
              ${f1(region.etc)} mm
            </td>

            <td>
              ${fmt(region.demand)} L
            </td>

            <td>
              ${fmt(region.allocated)} L
            </td>

            <td>

              <span
                class="progress ${
                  percentage < 100
                    ? "short"
                    : ""
                }"
              >

                <i
                  style="
                    transform:
                      scaleX(
                        ${percentage / 100}
                      )
                  "
                ></i>

              </span>

              ${f1(percentage)}%

            </td>

          </tr>

        `;

      })
      .join("");

}


/* =========================================================
   SENSOR HEALTH
========================================================= */

function renderSensorHealth() {

  $("sensor-health").innerHTML =

    state.regions
      .map(
        region => `

          <div class="sensor-card">

            <span>
              Zone ${region.letter}
            </span>

            <b
              class="${
                region.sensorOk
                  ? "sensor-ok"
                  : "sensor-fail"
              }"
            >

              ${
                region.sensorOk
                  ? "● SENSOR VALID"
                  : "⚠ FALLBACK MODEL"
              }

            </b>

            <small>
              Last valid:
              ${f1(region.lastGood)}%
            </small>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   FIXED SCHEDULE
========================================================= */

function fixedSchedule() {

  let water = 0;

  let events = 0;

  let stress = 0;


  state.regions.forEach(
    region => {

      const soil =
        SOILS[
          region.soil
        ];


      /*
        Fixed schedule:
        water each zone to
        80% of field capacity
        once per day.

        It does NOT react to
        rain, crop stage or
        reservoir shortage.
      */

      const fixedTarget =
        soil.thetaFC * 0.80;


      const deficit =
        Math.max(
          0,
          fixedTarget -
          region.moisture
        );


      const liters =
        (
          deficit / 100
        ) *
        250000 *
        soil.root *
        1000;


      water += liters;

      events++;


      if (
        region.moisture <
        soil.wp + 2
      ) {

        stress++;

      }

    });


  return {
    water,
    events,
    stress
  };

}


/* =========================================================
   DYNAMIC VS FIXED
========================================================= */

function renderComparison(
  totalDemand,
  gate
) {

  const dynamic =
    gate.type === "DELAYED" ||
    gate.type === "STANDBY"
      ? 0
      : state.regions.reduce(
          (sum, region) =>
            sum + region.allocated,
          0
        );


  const fixed =
    fixedSchedule();


  const saved =
    Math.max(
      0,
      fixed.water -
      dynamic
    );


  const savedPercent =
    fixed.water > 0
      ? saved /
        fixed.water *
        100
      : 0;


  const dynamicStress =
    state.regions.filter(
      region =>
        region.moisture <
        SOILS[
          region.soil
        ].wp + 2
    ).length;


  $("dynamic-water").textContent =
    `${fmt(dynamic)} L`;


  $("dynamic-events").textContent =
    `${dynamic > 0
      ? state.regions.filter(
          r => r.allocated > 0
        ).length
      : 0
    } zone events`;


  $("fixed-water").textContent =
    `${fmt(fixed.water)} L`;


  $("fixed-events").textContent =
    `${fixed.events} scheduled events`;


  $("saved-water").textContent =
    `${fmt(saved)} L`;


  $("saved-pct").textContent =
    `${f1(savedPercent)}% lower water use in this scenario`;


  $("stress-result").textContent =
    `${dynamicStress} zone(s)`;


  /*
    Plotly comparison chart
  */

  if (
    window.Plotly
  ) {

    Plotly.react(

      "comparison-chart",

      [

        {

          x: [
            "Dynamic Controller",
            "Fixed Schedule"
          ],

          y: [
            dynamic,
            fixed.water
          ],

          type: "bar",

          text: [
            `${fmt(dynamic)} L`,
            `${fmt(fixed.water)} L`
          ],

          textposition:
            "auto"

        }

      ],

      {

        margin: {
          t: 20,
          r: 20,
          b: 55,
          l: 70
        },

        paper_bgcolor:
          "transparent",

        plot_bgcolor:
          "transparent",

        yaxis: {
          title: "Water Used (L)"
        },

        font: {
          family:
            "Plus Jakarta Sans"
        }

      },

      {
        displayModeBar: false,
        responsive: true
      }

    );

  }

}


/* =========================================================
   LOCATION SEARCH
========================================================= */

async function searchLocation(
  query
) {

  if (!query) return;


  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(query)}` +
    "&count=5" +
    "&language=en" +
    "&format=json";


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Geocoding failed"
      );

    }


    const data =
      await response.json();


    const results =
      $("location-results");


    results.innerHTML =
      "";


    (
      data.results || []
    ).forEach(
      location => {

        const button =
          document.createElement(
            "button"
          );


        button.className =
          "location-chip";


        button.textContent =
          `${location.name}, ${
            location.admin1 ||
            location.country ||
            ""
          }`;


        button.onclick =
          () => {

            state.location = {

              name:
                button.textContent,

              lat:
                location.latitude,

              lon:
                location.longitude

            };


            $("location-input")
              .value =
              button.textContent;


            results.innerHTML =
              "";


            fetchWeather();

          };


        results.appendChild(
          button
        );

      }
    );


  } catch (error) {

    log(
      "Location search failed.",
      "WARN"
    );

  }

}


/* =========================================================
   OPEN-METEO WEATHER
========================================================= */

async function fetchWeather() {

  const {
    lat,
    lon
  } =
    state.location;


  /*
    Daily variables:

    temperature
    precipitation
    wind
    radiation
    FAO-56 ET0

    Hourly variables:

    humidity
    VPD
    temperature
    wind
  */

  const dailyVariables =
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "shortwave_radiation_sum",
      "et0_fao_evapotranspiration"
    ].join(",");


  const hourlyVariables =
    [
      "relative_humidity_2m",
      "temperature_2m",
      "vapour_pressure_deficit",
      "wind_speed_10m",
      "precipitation"
    ].join(",");


  const url =
    "https://api.open-meteo.com/v1/forecast" +

    `?latitude=${lat}` +

    `&longitude=${lon}` +

    "&timezone=auto" +

    "&forecast_days=7" +

    `&daily=${dailyVariables}` +

    `&hourly=${hourlyVariables}`;


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Open-Meteo request failed"
      );

    }


    const data =
      await response.json();


    state.weather.live =
      true;


    state.weather.forecast =
      data.daily;


    const daily =
      data.daily;


    const hourly =
      data.hourly;


    /*
      Find current hour.
    */

    const now =
      new Date();


    let hourIndex =
      hourly.time.findIndex(
        time =>
          new Date(time) >= now
      );


    if (hourIndex < 0) {

      hourIndex = 0;

    }


    /*
      Real forecast values
    */

    state.weather.rain =
      Number(
        daily
          .precipitation_sum?.[0]
        || 0
      );


    state.weather.temperature =
      Number(
        daily
          .temperature_2m_max?.[0]
        || 30
      );


    state.weather.et0 =
      Number(
        daily
          .et0_fao_evapotranspiration?.[0]
        || 4
      );


    state.weather.wind =
      Number(
        daily
          .wind_speed_10m_max?.[0]
        || 2
      );


    state.weather.humidity =
      Number(
        hourly
          .relative_humidity_2m?.[
            hourIndex
          ]
        || 45
      );


    state.weather.vpd =
      Number(
        hourly
          .vapour_pressure_deficit?.[
            hourIndex
          ]
        || 1.2
      );


    /*
      UI status
    */

    $("api-status").innerHTML =
      `
      <span class="pulse-dot"></span>
      <span>
        WEATHER: OPEN-METEO LIVE
      </span>
      `;


    $("weather-badge").textContent =
      "LIVE API";


    $("weather-badge")
      .className =
      "badge success";


    /*
      Manual sliders reflect
      live values.
    */

    $("rain-slider").value =
      Math.min(
        50,
        state.weather.rain
      );


    $("rh-slider").value =
      state.weather.humidity;


    $("temp-slider").value =
      state.weather.temperature;


    $("rain-val").textContent =
      `${f1(
        state.weather.rain
      )} mm`;


    $("rh-val").textContent =
      `${f1(
        state.weather.humidity
      )}%`;


    $("temp-val").textContent =
      `${f1(
        state.weather.temperature
      )}°C`;


    log(
      `Open-Meteo forecast loaded for ${state.location.name}. ET₀ = ${f1(state.weather.et0)} mm/day.`,
      "WEATHER"
    );


    render();

    renderForecast();


  } catch (error) {

    /*
      API failure:

      Keep application functional
      using manual weather controls.
    */

    state.weather.live =
      false;


    $("api-status").innerHTML =
      `
      <span class="pulse-dot"></span>
      <span>
        WEATHER: MANUAL FALLBACK
      </span>
      `;


    $("weather-badge").textContent =
      "FALLBACK";


    $("weather-badge")
      .className =
      "badge warning";


    log(
      "Open-Meteo unavailable. Manual weather fallback active.",
      "WARN"
    );


    render();

  }

}


/* =========================================================
   FORECAST PLOT
========================================================= */

function renderForecast() {

  if (
    !window.Plotly ||
    !state.weather.forecast
  ) {

    return;

  }


  const forecast =
    state.weather.forecast;


  Plotly.react(

    "forecast-chart",

    [

      {

        x:
          forecast.time,

        y:
          forecast
            .et0_fao_evapotranspiration,

        name:
          "ET₀ (mm/day)",

        type:
          "scatter",

        mode:
          "lines+markers"

      },

      {

        x:
          forecast.time,

        y:
          forecast
            .precipitation_sum,

        name:
          "Precipitation (mm)",

        type:
          "bar"

      }

    ],

    {

      margin: {
        t: 15,
        r: 20,
        b: 45,
        l: 50
      },

      paper_bgcolor:
        "transparent",

      plot_bgcolor:
        "transparent",

      xaxis: {
        title: "Date"
      },

      yaxis: {
        title: "mm"
      },

      legend: {
        orientation: "h"
      },

      font: {
        family:
          "Plus Jakarta Sans"
      }

    },

    {

      displayModeBar:
        false,

      responsive:
        true

    }

  );

}


/* =========================================================
   IRRIGATION CYCLE
========================================================= */

function runIrrigationCycle() {

  if (
    state.simulating
  ) return;


  const gate =
    state.gate;


  /*
    Rain gate.
  */

  if (
    gate.type ===
    "DELAYED"
  ) {

    log(
      gate.reason,
      "GATE"
    );


    playTone(220);


    alert(
      `[ArgiFlow]

IRRIGATION DELAYED

${gate.reason}`
    );


    return;

  }


  const total =
    state.regions.reduce(
      (sum, region) =>
        sum +
        region.allocated,
      0
    );


  if (!total) {

    return;

  }


  state.simulating =
    true;


  log(
    `Dispatching ${fmt(total)} L across eligible zones.`,
    "ACTION"
  );


  playTone(700);


  const startMoisture =
    state.regions.map(
      r => r.moisture
    );


  const startReservoir =
    state.reservoir;


  const startTime =
    performance.now();


  const duration =
    1800;


  state.regions.forEach(
    region => {

      if (
        region.allocated > 0
      ) {

        $(
          `zone-${region.id}`
        )
          .classList
          .add(
            "irrigating"
          );

      }

    }
  );


  function animate(currentTime) {

    const progress =
      Math.min(
        1,
        (
          currentTime -
          startTime
        ) /
        duration
      );


    state.regions.forEach(
      (region,index) => {

        if (
          region.allocated <= 0
        ) {

          return;

        }


        /*
          Convert allocated
          water into moisture lift.
        */

        const moistureLift =
          (
            region.allocated /
            (
              region.areaM2 *
              SOILS[
                region.soil
              ].root *
              1000
            )
          ) *
          100;


        region.moisture =
          Math.min(
            region.target,

            startMoisture[index] +
            moistureLift *
            progress
          );


        region.lastGood =
          region.moisture;

      });


    state.reservoir =
      Math.max(
        0,

        startReservoir -
        total *
        progress
      );


    render();


    if (
      progress < 1
    ) {

      requestAnimationFrame(
        animate
      );

    } else {

      state.simulating =
        false;


      state.regions.forEach(
        region => {

          $(
            `zone-${region.id}`
          )
            .classList
            .remove(
              "irrigating"
            );

        }
      );


      log(
        "Irrigation cycle complete. Reservoir and moisture states updated.",
        "ACTION"
      );


      playTone(900);

    }

  }


  requestAnimationFrame(
    animate
  );

}


/* =========================================================
   ADVANCE ONE DAY
========================================================= */

function advanceDay() {

  state.regions.forEach(
    region => {

      /*
        ET-driven moisture loss.

        This is the simulated
        daily soil state update.
      */

      const loss =
        Math.min(
          4,

          Math.max(
            0.4,

            state.weather.et0 *
            0.65 *
            getKc(region)
          )
        );


      if (
        region.sensorOk
      ) {

        region.moisture =
          Math.max(
            0,
            region.moisture -
            loss
          );


        region.lastGood =
          region.moisture;

      } else {

        /*
          Sensor failure fallback:

          last valid state
          +
          modeled ET loss
        */

        region.lastGood =
          Math.max(
            0,
            region.lastGood -
            loss
          );


        region.moisture =
          region.lastGood;

      }

    }
  );


  log(
    "One modeled day advanced: ET-driven soil moisture loss applied.",
    "MODEL"
  );


  render();

}


/* =========================================================
   RANDOMIZE
========================================================= */

function randomizeScenario() {

  const soils =
    Object.keys(
      SOILS
    );


  const crops =
    Object.keys(
      CROPS
    );


  state.regions.forEach(
    region => {

      region.soil =
        soils[
          Math.floor(
            Math.random() *
            soils.length
          )
        ];


      region.crop =
        crops[
          Math.floor(
            Math.random() *
            crops.length
          )
        ];


      region.stage =
        STAGES[
          Math.floor(
            Math.random() *
            STAGES.length
          )
        ];


      const soil =
        SOILS[
          region.soil
        ];


      region.moisture =
        Math.round(
          (
            soil.wp +
            Math.random() *
            (
              soil.thetaFC -
              soil.wp
            )
          ) *
          10
        ) / 10;


      region.lastGood =
        region.moisture;


      region.sensorOk =
        Math.random() > 0.15;

    });


  state.reservoir =
    [
      3000000,
      8000000,
      15000000,
      20000000
    ][
      Math.floor(
        Math.random() * 4
      )
    ];


  $("res-slider").value =
    state.reservoir;


  $("res-val").textContent =
    `${fmt(
      state.reservoir
    )} L`;


  renderZones();

  render();


  log(
    "Random agronomic scenario generated.",
    "SYSTEM"
  );

}


/* =========================================================
   EVENT LISTENERS
========================================================= */


/* Location */

$("btn-search").onclick =
  () => {

    searchLocation(
      $("location-input")
        .value
        .trim()
    );

  };


$("location-input").onkeydown =
  event => {

    if (
      event.key ===
      "Enter"
    ) {

      $("btn-search").click();

    }

  };


/* GPS */

$("btn-location").onclick =
  () => {

    if (
      !navigator.geolocation
    ) {

      alert(
        "Browser geolocation is unavailable."
      );

      return;

    }


    navigator.geolocation
      .getCurrentPosition(

        position => {

          state.location = {

            name:
              "Current GPS location",

            lat:
              position.coords.latitude,

            lon:
              position.coords.longitude

          };


          fetchWeather();

        },

        () => {

          alert(
            "Location permission was not granted."
          );

        }

      );

  };


/* Manual weather */

$("rain-slider").oninput =
  event => {

    state.weather.rain =
      Number(
        event.target.value
      );


    state.weather.live =
      false;


    $("rain-val").textContent =
      `${f1(
        state.weather.rain
      )} mm`;


    render();

  };


$("rh-slider").oninput =
  event => {

    state.weather.humidity =
      Number(
        event.target.value
      );


    state.weather.live =
      false;


    $("rh-val").textContent =
      `${f1(
        state.weather.humidity
      )}%`;


    render();

  };


$("temp-slider").oninput =
  event => {

    state.weather.temperature =
      Number(
        event.target.value
      );


    state.weather.live =
      false;


    $("temp-val").textContent =
      `${f1(
        state.weather.temperature
      )}°C`;


    render();

  };


/* Reservoir */

$("res-slider").oninput =
  event => {

    state.reservoir =
      Number(
        event.target.value
      );


    $("res-val").textContent =
      `${fmt(
        state.reservoir
      )} L`;


    render();

  };


document
  .querySelectorAll(
    ".chips button"
  )
  .forEach(
    button => {

      button.onclick =
        () => {

          state.reservoir =
            Number(
              button.dataset.res
            );


          $("res-slider")
            .value =
            state.reservoir;


          $("res-val")
            .textContent =
            `${fmt(
              state.reservoir
            )} L`;


          render();

        };

    }
  );


/* Optimization */

$("strategy").onchange =
  event => {

    state.strategy =
      event.target.value;

    render();

  };


/* Buttons */

$("btn-run").onclick =
  runIrrigationCycle;


$("btn-evap").onclick =
  advanceDay;


$("btn-randomize").onclick =
  randomizeScenario;


/* Sensor failure */

$("btn-fail-all").onclick =
  () => {

    state.allSensorsFailed =
      !state.allSensorsFailed;


    state.regions.forEach(
      region => {

        region.sensorOk =
          !state.allSensorsFailed;

      }
    );


    renderZones();

    render();


    log(
      state.allSensorsFailed
        ? "All sensor failures injected. Fallback model active."
        : "All sensors restored.",
      "SENSOR"
    );

  };


/* Sound */

$("btn-sound-toggle").onclick =
  () => {

    state.sound =
      !state.sound;


    $("btn-sound-toggle")
      .textContent =
      state.sound
        ? "🔊"
        : "🔇";

  };


/* Clear logs */

$("btn-clear").onclick =
  () => {

    $("logs").innerHTML =
      "";

  };


/* =========================================================
   START APPLICATION
========================================================= */

renderZones();

render();

log(
  "Four-zone model ready. Soil sensors are simulated.",
  "SYSTEM"
);

log(
  "Attempting Open-Meteo live weather connection...",
  "WEATHER"
);

fetchWeather();
