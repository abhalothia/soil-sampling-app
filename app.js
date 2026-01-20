// Fortune Farming Soil Sampling App
// Main application logic

// ==========================================
// Supabase Configuration (Update these)
// ==========================================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Check if Supabase is configured
const isSupabaseConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';

// ==========================================
// App State
// ==========================================
let map = null;
let markers = {};
let selectedPoint = null;
let observations = [];
let samplesTaken = {}; // Track which points have samples taken
let userPosition = null; // Current GPS position
let userMarker = null; // Marker showing user location
const PROXIMITY_THRESHOLD = 30; // meters - warn if user is farther than this

// ==========================================
// Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            console.log('SW registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showUpdateNotification();
                    }
                });
            });
        })
        .catch(err => console.log('SW registration failed:', err));

    // Reload when new SW takes over
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

function showUpdateNotification() {
    const update = confirm('A new version is available. Reload to update?');
    if (update) {
        navigator.serviceWorker.ready.then(registration => {
            registration.waiting.postMessage('skipWaiting');
        });
    }
}

// ==========================================
// Initialize App
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initMap();
    initProgressDots();
    initChecklist();
    initForm();
    initDataTab();
    loadObservations();
    loadSamplesTaken();
    updateUI();
});

// ==========================================
// Tab Navigation
// ==========================================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });

            // Resize map when switching to map tab
            if (tabId === 'map' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });
}

// ==========================================
// Map Initialization
// ==========================================
function initMap() {
    // Initialize Leaflet map
    map = L.map('map', {
        center: [MAP_CENTER.lat, MAP_CENTER.lon],
        zoom: 17,
        zoomControl: true,
        attributionControl: true
    });

    // Add satellite layer as default
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri'
    }).addTo(map);

    // Add street layer option
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    });

    // Layer control
    const baseMaps = {
        'Satellite': satellite,
        'Street': street
    };

    L.control.layers(baseMaps).addTo(map);

    // Add plot boundary polygon
    const polygon = L.polygon(PLOT_POLYGON, {
        color: '#000000',
        weight: 3,
        fillColor: '#000000',
        fillOpacity: 0.1
    }).addTo(map);

    // Add sampling point markers
    SAMPLING_POINTS.forEach(point => {
        const icon = L.divIcon({
            className: 'sample-marker-wrapper',
            html: `<div class="sample-marker" id="marker-${point.number}">${point.number}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([point.lat, point.lon], { icon: icon })
            .addTo(map);

        marker.on('click', () => selectPoint(point));
        markers[point.number] = marker;
    });

    // Add route line (suggested walking path)
    const routeCoords = SAMPLING_POINTS.map(p => [p.lat, p.lon]);

    L.polyline(routeCoords, {
        color: '#1976d2',
        weight: 2,
        dashArray: '10, 10',
        opacity: 0.7
    }).addTo(map);

    // Fit map to polygon bounds
    map.fitBounds(polygon.getBounds().pad(0.1));

    // Setup point info panel close button
    document.getElementById('close-panel').addEventListener('click', () => {
        document.getElementById('point-info').classList.add('hidden');
        selectedPoint = null;
    });

    // Setup navigation button
    document.getElementById('navigate-btn').addEventListener('click', navigateToPoint);

    // Setup sample button
    document.getElementById('sample-btn').addEventListener('click', toggleSampleInstructions);

    // Setup sample done button
    document.getElementById('sample-done-btn').addEventListener('click', markSampleDone);

    // Setup record button
    document.getElementById('record-btn').addEventListener('click', openObservationForm);

    // Start GPS tracking
    startGPSTracking();
}

// ==========================================
// Point Selection
// ==========================================
function selectPoint(point) {
    selectedPoint = point;

    // Update panel info
    document.getElementById('point-number').textContent = point.number;
    document.getElementById('point-grid').textContent = point.grid;
    document.getElementById('point-lat').textContent = point.lat.toFixed(5);
    document.getElementById('point-lon').textContent = point.lon.toFixed(5);

    // Update sample instructions point number
    document.querySelector('.sample-point-num').textContent = point.number;

    // Hide sample instructions when switching points
    hideSampleInstructions();

    // Check if observation exists
    const existingObs = observations.find(o => o.pointNumber === point.number);
    const statusEl = document.getElementById('point-status');

    if (existingObs) {
        statusEl.textContent = `Recorded: ${existingObs.whiteDeposits} deposits, ${existingObs.soilColor} soil`;
    } else {
        statusEl.textContent = '';
    }

    // Update button states
    updateButtonStates(point.number);

    // Update proximity display
    updateProximityDisplay();

    // Show panel
    document.getElementById('point-info').classList.remove('hidden');

    // Center map on point
    map.panTo([point.lat, point.lon]);
}

function updateButtonStates(pointNumber) {
    const sampleBtnText = document.getElementById('sample-btn-text');
    const recordBtnText = document.getElementById('record-btn-text');

    // Check if sample was taken
    if (samplesTaken[pointNumber]) {
        sampleBtnText.classList.add('btn-completed');
    } else {
        sampleBtnText.classList.remove('btn-completed');
    }

    // Check if data was recorded
    const hasObservation = observations.some(o => o.pointNumber === pointNumber);
    if (hasObservation) {
        recordBtnText.classList.add('btn-completed');
    } else {
        recordBtnText.classList.remove('btn-completed');
    }
}

// ==========================================
// Navigation
// ==========================================
function navigateToPoint() {
    if (!selectedPoint) return;

    const { lat, lon } = selectedPoint;
    // Open Google Maps directions
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
    window.open(url, '_blank');
}

// ==========================================
// Sample Instructions
// ==========================================
function toggleSampleInstructions() {
    const instructions = document.getElementById('sample-instructions');
    instructions.classList.toggle('hidden');

    // Reset checkboxes when opening
    if (!instructions.classList.contains('hidden')) {
        const checkboxes = instructions.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    }
}

function hideSampleInstructions() {
    document.getElementById('sample-instructions').classList.add('hidden');
}

function markSampleDone() {
    if (!selectedPoint) return;

    // Mark sample as taken for this point
    samplesTaken[selectedPoint.number] = true;
    saveSamplesTaken();

    // Update button state
    updateButtonStates(selectedPoint.number);

    // Hide instructions
    hideSampleInstructions();

    showToast(`Sample ${selectedPoint.number} marked complete`);
}

function saveSamplesTaken() {
    localStorage.setItem('samplesTaken', JSON.stringify(samplesTaken));
}

function loadSamplesTaken() {
    const saved = localStorage.getItem('samplesTaken');
    samplesTaken = saved ? JSON.parse(saved) : {};
}

// ==========================================
// Progress Dots
// ==========================================
function initProgressDots() {
    const container = document.getElementById('progress-dots');
    container.innerHTML = '';

    SAMPLING_POINTS.forEach(point => {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        dot.id = `dot-${point.number}`;
        dot.textContent = point.number;
        dot.addEventListener('click', () => selectPoint(point));
        container.appendChild(dot);
    });
}

function updateProgressDots() {
    SAMPLING_POINTS.forEach(point => {
        const dot = document.getElementById(`dot-${point.number}`);
        const markerEl = document.getElementById(`marker-${point.number}`);
        const hasObservation = observations.some(o => o.pointNumber === point.number);

        if (hasObservation) {
            dot.classList.add('completed');
            dot.classList.remove('current');
            if (markerEl) markerEl.classList.add('completed');
        } else {
            dot.classList.remove('completed');
            if (markerEl) markerEl.classList.remove('completed');
        }
    });

    // Find first incomplete point and mark as current
    const firstIncomplete = SAMPLING_POINTS.find(
        p => !observations.some(o => o.pointNumber === p.number)
    );

    if (firstIncomplete) {
        const dot = document.getElementById(`dot-${firstIncomplete.number}`);
        dot.classList.add('current');
    }
}

// ==========================================
// Checklist
// ==========================================
function initChecklist() {
    const container = document.getElementById('equipment-checklist');

    // Load saved checklist state
    const savedChecklist = JSON.parse(localStorage.getItem('equipmentChecklist') || '{}');

    EQUIPMENT_CHECKLIST.forEach((item, index) => {
        const li = document.createElement('li');
        const isChecked = savedChecklist[index] || false;

        li.innerHTML = `
            <label>
                <input type="checkbox" data-index="${index}" ${isChecked ? 'checked' : ''}>
                ${item}
            </label>
        `;
        container.appendChild(li);
    });

    // Save checklist state on change
    container.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const saved = JSON.parse(localStorage.getItem('equipmentChecklist') || '{}');
            saved[e.target.dataset.index] = e.target.checked;
            localStorage.setItem('equipmentChecklist', JSON.stringify(saved));
        }
    });
}

// ==========================================
// Observation Form
// ==========================================
function initForm() {
    const modal = document.getElementById('observation-modal');
    const form = document.getElementById('observation-form');

    // Close modal handlers
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-form').addEventListener('click', closeModal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Form submission
    form.addEventListener('submit', handleFormSubmit);
}

function openObservationForm() {
    if (!selectedPoint) return;

    // Populate form with point data
    document.getElementById('form-point-number').value = selectedPoint.number;
    document.getElementById('form-grid-ref').value = selectedPoint.grid;
    document.getElementById('form-lat').value = selectedPoint.lat;
    document.getElementById('form-lon').value = selectedPoint.lon;
    document.getElementById('form-point-display').textContent =
        `${selectedPoint.number} (${selectedPoint.grid})`;

    // Check for existing observation
    const existing = observations.find(o => o.pointNumber === selectedPoint.number);
    if (existing) {
        // Pre-fill form with existing data
        setRadioValue('whiteDeposits', existing.whiteDeposits);
        setRadioValue('soilColor', existing.soilColor);
        setRadioValue('waterlogging', existing.waterlogging);
        setRadioValue('compaction', existing.compaction);
        setRadioValue('vegetation', existing.vegetation);
        document.getElementById('notes').value = existing.notes || '';
    } else {
        // Reset form - clear all radio buttons
        document.getElementById('observation-form').reset();
        document.getElementById('form-point-number').value = selectedPoint.number;
        document.getElementById('form-grid-ref').value = selectedPoint.grid;
        document.getElementById('form-lat').value = selectedPoint.lat;
        document.getElementById('form-lon').value = selectedPoint.lon;

        // Explicitly uncheck all radio buttons
        const allRadios = document.querySelectorAll('#observation-form input[type="radio"]');
        allRadios.forEach(radio => radio.checked = false);

        // Clear notes
        document.getElementById('notes').value = '';
    }

    // Show modal
    document.getElementById('observation-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('observation-modal').classList.add('hidden');
}

function setRadioValue(name, value) {
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) radio.checked = true;
}

function getRadioValue(name) {
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : null;
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const pointNumber = parseInt(document.getElementById('form-point-number').value);
    const gridRef = document.getElementById('form-grid-ref').value;
    const lat = parseFloat(document.getElementById('form-lat').value);
    const lon = parseFloat(document.getElementById('form-lon').value);

    // Create observation object
    const observation = {
        id: `obs_${pointNumber}_${Date.now()}`,
        pointNumber,
        gridRef,
        lat,
        lon,
        whiteDeposits: getRadioValue('whiteDeposits'),
        soilColor: getRadioValue('soilColor'),
        waterlogging: getRadioValue('waterlogging'),
        compaction: getRadioValue('compaction'),
        vegetation: getRadioValue('vegetation'),
        notes: document.getElementById('notes').value,
        createdAt: new Date().toISOString()
    };

    // Remove existing observation for this point
    observations = observations.filter(o => o.pointNumber !== pointNumber);

    // Add new observation
    observations.push(observation);

    // Save to localStorage
    saveObservations();

    // If Supabase is configured, sync to cloud
    if (isSupabaseConfigured) {
        await syncToSupabase(observation);
    }

    // Update UI
    updateUI();
    updateButtonStates(pointNumber);
    closeModal();
    showToast(`Point ${pointNumber} data recorded`);

    // Close point info panel
    document.getElementById('point-info').classList.add('hidden');
}

// ==========================================
// Data Storage
// ==========================================
function saveObservations() {
    localStorage.setItem('soilObservations', JSON.stringify(observations));
}

function loadObservations() {
    const saved = localStorage.getItem('soilObservations');
    observations = saved ? JSON.parse(saved) : [];
}

// ==========================================
// Supabase Integration (Optional)
// ==========================================
async function syncToSupabase(observation) {
    if (!isSupabaseConfigured) return;

    try {
        // Insert observation record
        const response = await fetch(`${SUPABASE_URL}/rest/v1/soil_samples`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                point_number: observation.pointNumber,
                grid_ref: observation.gridRef,
                lat: observation.lat,
                lon: observation.lon,
                white_deposits: observation.whiteDeposits,
                soil_color: observation.soilColor,
                waterlogging: observation.waterlogging,
                compaction: observation.compaction,
                vegetation: observation.vegetation,
                notes: observation.notes,
                created_at: observation.createdAt
            })
        });

        if (response.ok) {
            console.log('Synced to Supabase');
        }
    } catch (error) {
        console.error('Supabase sync failed:', error);
    }
}

// ==========================================
// Data Tab
// ==========================================
function initDataTab() {
    document.getElementById('export-csv').addEventListener('click', exportCSV);
    document.getElementById('clear-data').addEventListener('click', clearAllData);
}

function updateObservationsList() {
    const container = document.getElementById('observations-list');

    if (observations.length === 0) {
        container.innerHTML = '<p class="empty-state">No observations recorded yet.</p>';
        return;
    }

    // Sort by point number
    const sorted = [...observations].sort((a, b) => a.pointNumber - b.pointNumber);

    container.innerHTML = sorted.map(obs => `
        <div class="observation-item">
            <h4>Point ${obs.pointNumber} (${obs.gridRef})</h4>
            <div class="obs-details">
                <span>Deposits: ${obs.whiteDeposits}</span>
                <span>Color: ${obs.soilColor}</span>
                <span>Waterlog: ${obs.waterlogging}</span>
                <span>Compact: ${obs.compaction}</span>
                <span>Veg: ${obs.vegetation}</span>
            </div>
            ${obs.notes ? `<p style="margin-top:8px; font-size:0.85rem;"><em>${obs.notes}</em></p>` : ''}
            <p class="obs-time">${new Date(obs.createdAt).toLocaleString()}</p>
        </div>
    `).join('');
}

async function exportCSV() {
    if (observations.length === 0) {
        showToast('No data to export');
        return;
    }

    const headers = [
        'Point', 'Grid', 'Lat', 'Lon', 'White Deposits', 'Soil Color',
        'Waterlogging', 'Compaction', 'Vegetation', 'Notes', 'Recorded At'
    ];

    const rows = observations.map(obs => [
        obs.pointNumber,
        obs.gridRef,
        obs.lat,
        obs.lon,
        obs.whiteDeposits,
        obs.soilColor,
        obs.waterlogging,
        obs.compaction,
        obs.vegetation,
        `"${(obs.notes || '').replace(/"/g, '""')}"`,
        obs.createdAt
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const fileName = `soil_samples_${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], fileName, { type: 'text/csv' });

    // Try Web Share API first (for mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Soil Sampling Data',
                text: 'Exported soil sampling observations'
            });
            showToast('Shared successfully');
            return;
        } catch (err) {
            // User cancelled or share failed, fall back to download
            if (err.name !== 'AbortError') {
                console.log('Share failed, falling back to download:', err);
            }
        }
    }

    // Fallback: Download file directly
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSV exported');
}

function clearAllData() {
    if (!confirm('Are you sure you want to delete all recorded observations? This cannot be undone.')) {
        return;
    }

    observations = [];
    saveObservations();
    updateUI();
    showToast('All data cleared');
}

// ==========================================
// UI Updates
// ==========================================
function updateUI() {
    updateProgressDots();
    updateObservationsList();
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// ==========================================
// GPS Tracking & Proximity
// ==========================================
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function startGPSTracking() {
    if (!navigator.geolocation) {
        console.log('Geolocation not supported');
        return;
    }

    navigator.geolocation.watchPosition(
        (position) => {
            userPosition = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy: position.coords.accuracy
            };

            // Update user marker on map
            updateUserMarker();

            // Update proximity display if a point is selected
            if (selectedPoint) {
                updateProximityDisplay();
            }
        },
        (error) => {
            console.log('GPS error:', error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000
        }
    );
}

function updateUserMarker() {
    if (!userPosition || !map) return;

    if (userMarker) {
        userMarker.setLatLng([userPosition.lat, userPosition.lon]);
    } else {
        // Create a blue pulsing dot for user location
        const userIcon = L.divIcon({
            className: 'user-marker-wrapper',
            html: '<div class="user-marker"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        userMarker = L.marker([userPosition.lat, userPosition.lon], { icon: userIcon })
            .addTo(map);
    }
}

function updateProximityDisplay() {
    const proximityInfo = document.getElementById('proximity-info');
    const distanceDisplay = document.getElementById('distance-display');
    const warningDisplay = document.getElementById('proximity-warning');

    if (!userPosition || !selectedPoint) {
        proximityInfo.classList.add('hidden');
        return;
    }

    const distance = getDistanceMeters(
        userPosition.lat, userPosition.lon,
        selectedPoint.lat, selectedPoint.lon
    );

    proximityInfo.classList.remove('hidden');
    distanceDisplay.textContent = `Distance: ${Math.round(distance)}m`;

    if (distance > PROXIMITY_THRESHOLD) {
        warningDisplay.classList.remove('hidden');
    } else {
        warningDisplay.classList.add('hidden');
    }
}
