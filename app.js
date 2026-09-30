// Open-Meteo WMO Weather Codes mapping
const WMO_WEATHER_CODES = {
  0: { description: 'Clear Sky', icon: '☀️' },
  1: { description: 'Mainly Clear', icon: '🌤️' },
  2: { description: 'Partly Cloudy', icon: '⛅' },
  3: { description: 'Overcast', icon: '☁️' },
  45: { description: 'Foggy', icon: '🌫️' },
  48: { description: 'Depositing Rime Fog', icon: '🌫️' },
  51: { description: 'Light Drizzle', icon: '🌧️' },
  53: { description: 'Moderate Drizzle', icon: '🌧️' },
  55: { description: 'Dense Drizzle', icon: '🌧️' },
  61: { description: 'Slight Rain', icon: '🌧️' },
  63: { description: 'Moderate Rain', icon: '🌧️' },
  65: { description: 'Heavy Rain', icon: '🌧️' },
  71: { description: 'Slight Snow', icon: '❄️' },
  73: { description: 'Moderate Snow', icon: '❄️' },
  75: { description: 'Heavy Snow', icon: '❄️' },
  80: { description: 'Light Rain Showers', icon: '🌦️' },
  81: { description: 'Moderate Rain Showers', icon: '🌦️' },
  82: { description: 'Violent Rain Showers', icon: '⛈️' },
  95: { description: 'Thunderstorm', icon: '🌩️' },
  96: { description: 'Thunderstorm + Light Hail', icon: '⛈️' },
  99: { description: 'Thunderstorm + Heavy Hail', icon: '⛈️' }
};

// Application State
let currentLocation = {
  name: 'Jaipur',
  country: 'India',
  lat: 26.9124,
  lon: 75.7873
};

// DOM Elements
const openModalBtn = document.getElementById('openLocationModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const locationModal = document.getElementById('locationModal');
const useGpsBtn = document.getElementById('useGpsBtn');
const searchForm = document.getElementById('locationSearchForm');
const searchInput = document.getElementById('searchInput');
const searchSpinner = document.getElementById('searchSpinner');
const searchResultsList = document.getElementById('searchResultsList');

const loader = document.getElementById('loader');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const weatherDashboard = document.getElementById('weatherDashboard');

const headerLocationName = document.getElementById('headerLocationName');
const cityNameEl = document.getElementById('cityName');
const countryNameEl = document.getElementById('countryName');
const runningScoreBadge = document.getElementById('runningScoreBadge');
const weatherIconEl = document.getElementById('weatherIcon');
const tempValEl = document.getElementById('temperatureVal');
const weatherConditionEl = document.getElementById('weatherCondition');
const feelsLikeValEl = document.getElementById('feelsLikeVal');
const runningAdviceText = document.getElementById('runningAdviceText');

const windValEl = document.getElementById('windVal');
const humidityValEl = document.getElementById('humidityVal');
const precipValEl = document.getElementById('precipVal');
const windDirValEl = document.getElementById('windDirVal');
const forecastContainer = document.getElementById('forecastContainer');

// Event Listeners
openModalBtn.addEventListener('click', () => locationModal.showModal());
closeModalBtn.addEventListener('click', () => locationModal.close());
retryBtn.addEventListener('click', () => loadWeatherData());

useGpsBtn.addEventListener('click', getUserGpsLocation);
searchForm.addEventListener('submit', handleSearchSubmit);

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  // Automatically trigger GPS detection or load default
  getUserGpsLocation();
});

// Fetch Weather Data from Open-Meteo API
async function loadWeatherData() {
  showLoader();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentLocation.lat}&longitude=${currentLocation.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Open-Meteo API response error');

    const data = await response.json();
    renderWeather(data);
    showDashboard();
  } catch (err) {
    showError(err.message || 'Failed to fetch weather forecast.');
  }
}

// Render Weather UI
function renderWeather(data) {
  const current = data.current;
  const weatherInfo = WMO_WEATHER_CODES[current.weather_code] || { description: 'Unknown', icon: '🌡️' };

  // Update Header & Card Titles
  headerLocationName.textContent = `${currentLocation.name}, ${currentLocation.country || ''}`;
  cityNameEl.textContent = currentLocation.name;
  countryNameEl.textContent = currentLocation.country || 'Custom Location';

  // Current Weather
  weatherIconEl.textContent = weatherInfo.icon;
  tempValEl.textContent = Math.round(current.temperature_2m);
  weatherConditionEl.textContent = weatherInfo.description;
  feelsLikeValEl.textContent = `${Math.round(current.apparent_temperature)}°C`;

  // Metrics
  windValEl.textContent = `${current.wind_speed_10m} km/h`;
  humidityValEl.textContent = `${current.relative_humidity_2m}%`;
  precipValEl.textContent = `${current.precipitation} mm`;
  windDirValEl.textContent = `${current.wind_direction_10m}°`;

  // Evaluate Running Conditions
  evaluateRunningConditions(current.temperature_2m, current.wind_speed_10m, current.precipitation, current.weather_code);

  // Render 7-Day Forecast
  renderForecast(data.daily);
}

// Running Suitability Algorithm
function evaluateRunningConditions(temp, wind, precip, code) {
  let score = 'ideal';
  let advice = [];

  if (temp < 5) {
    advice.push("Cold temperature - wear thermal layers and warm up thoroughly.");
    score = 'moderate';
  } else if (temp > 28) {
    advice.push("High temperature - stay hydrated and avoid peak heat hours.");
    score = 'moderate';
  } else {
    advice.push("Great running temperature range!");
  }

  if (wind > 25) {
    advice.push("Strong wind expected - consider an inland or protected route.");
    score = score === 'ideal' ? 'moderate' : 'poor';
  }

  if (precip > 1.0 || (code >= 61 && code <= 99)) {
    advice.push("Precipitation or rain warning - wear water-resistant shoes.");
    score = 'poor';
  }

  // Update Badge
  runningScoreBadge.className = `score-badge ${score}`;
  if (score === 'ideal') {
    runningScoreBadge.textContent = '🟢 Excellent Running Conditions';
  } else if (score === 'moderate') {
    runningScoreBadge.textContent = '🟠 Caution Advised';
  } else {
    runningScoreBadge.textContent = '🔴 Poor Running Conditions';
  }

  runningAdviceText.textContent = advice.join(' ');
}

// Render Daily Forecast List
function renderForecast(daily) {
  forecastContainer.innerHTML = '';
  const days = daily.time;

  days.forEach((dateStr, index) => {
    const dateObj = new Date(dateStr);
    const dayName = index === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const code = daily.weather_code[index];
    const condition = WMO_WEATHER_CODES[code] || { icon: '🌤️' };
    const maxTemp = Math.round(daily.temperature_2m_max[index]);
    const minTemp = Math.round(daily.temperature_2m_min[index]);

    const itemEl = document.createElement('div');
    itemEl.className = 'forecast-item';
    itemEl.innerHTML = `
      <span class="forecast-date">${dayName}</span>
      <div class="forecast-condition">
        <span>${condition.icon}</span>
      </div>
      <div class="forecast-temps">
        <span class="temp-max">${maxTemp}°</span>
        <span class="temp-min">${minTemp}°</span>
      </div>
    `;

    forecastContainer.appendChild(itemEl);
  });
}

// User GPS Auto-Detection
function getUserGpsLocation() {
  if (!navigator.geolocation) {
    loadWeatherData();
    return;
  }

  showLoader();
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      try {
        // Reverse Geocode location name
        const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const geoData = await geoRes.json();

        currentLocation = {
          name: geoData.city || geoData.locality || 'GPS Location',
          country: geoData.countryName || '',
          lat: lat,
          lon: lon
        };
      } catch (e) {
        currentLocation = { name: 'Current Location', country: '', lat, lon };
      }

      locationModal.close();
      loadWeatherData();
    },
    (err) => {
      console.warn('GPS denied/failed. Falling back to default location.', err);
      locationModal.close();
      loadWeatherData();
    }
  );
}

// City Search via Open-Meteo Geocoding API
async function handleSearchSubmit(e) {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  searchSpinner.classList.remove('hidden');
  searchResultsList.innerHTML = '';

  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    const data = await response.json();

    searchSpinner.classList.add('hidden');

    if (!data.results || data.results.length === 0) {
      searchResultsList.innerHTML = `<li style="color:var(--text-secondary); text-align:center; padding:12px;">No cities found matching "${query}"</li>`;
      return;
    }

    data.results.forEach(result => {
      const li = document.createElement('li');
      li.className = 'search-result-item';
      li.innerHTML = `
        <div>
          <div class="result-name">${result.name}</div>
          <div class="result-sub">${result.admin1 ? result.admin1 + ', ' : ''}${result.country || ''}</div>
        </div>
        <span style="font-size:0.8rem; color:var(--text-secondary);">Select</span>
      `;

      li.addEventListener('click', () => {
        currentLocation = {
          name: result.name,
          country: result.country || '',
          lat: result.latitude,
          lon: result.longitude
        };
        locationModal.close();
        searchInput.value = '';
        searchResultsList.innerHTML = '';
        loadWeatherData();
      });

      searchResultsList.appendChild(li);
    });
  } catch (err) {
    searchSpinner.classList.add('hidden');
    searchResultsList.innerHTML = `<li style="color:var(--accent-red); text-align:center; padding:12px;">Search failed. Try again.</li>`;
  }
}

// UI Helpers
function showLoader() {
  loader.classList.remove('hidden');
  errorMessage.classList.add('hidden');
  weatherDashboard.classList.add('hidden');
}

function showDashboard() {
  loader.classList.add('hidden');
  errorMessage.classList.add('hidden');
  weatherDashboard.classList.remove('hidden');
}

function showError(msg) {
  loader.classList.add('hidden');
  weatherDashboard.classList.add('hidden');
  errorMessage.classList.remove('hidden');
  errorText.textContent = msg;
}
