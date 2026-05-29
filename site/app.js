(function () {
  'use strict';

  // City Hall, Philadelphia
  const map = L.map('map', { zoomControl: true }).setView([39.9526, -75.1652], 16);

  // Tile options (swap URL + attribution to change style):
  // Positron (light, minimal):   https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
  // Positron no labels:          https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png
  // Dark Matter:                 https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  L.Control.geocoder({
    defaultMarkGeocode: false,
    collapsed: true,
    placeholder: 'Search address…',
    geocoder: L.Control.Geocoder.nominatim({
      geocodingQueryParams: {
        countrycodes: 'us',
        viewbox: '-75.35,39.85,-74.95,40.15',
        bounded: 0,
      },
    }),
  })
    .on('markgeocode', function (e) { map.fitBounds(e.geocode.bbox); })
    .addTo(map);

  // --- Sidebar ---

  const sidebar = document.getElementById('sidebar');
  const sidebarContent = document.getElementById('sidebar-content');
  const closeBtn = document.getElementById('close-btn');

  function closeSidebar() { sidebar.classList.add('hidden'); }
  closeBtn.addEventListener('click', closeSidebar);
  map.on('click', closeSidebar);

  var ALLOWED_ORIGIN = 'https://www.phillyhistory.org/';
  function safeUrl(url) {
    return typeof url === 'string' && url.startsWith(ALLOWED_ORIGIN) ? url : null;
  }
  function safeId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  }

  var chunkCache = {}; // chunk_id → {id: record, ...}
  var CHUNK_SIZE = 500;

  function fetchDetail(id, callback) {
    var chunkId = Math.floor(parseInt(id, 10) / CHUNK_SIZE);
    if (chunkCache[chunkId]) { callback(chunkCache[chunkId][id]); return; }
    fetch('chunks/' + chunkId + '.json')
      .then(function (r) { return r.json(); })
      .then(function (chunk) { chunkCache[chunkId] = chunk; callback(chunk[id]); })
      .catch(function () { callback(null); });
  }

  function openSidebar(rawId) {
    var id = safeId(rawId);
    if (!id) return;
    sidebar.classList.remove('hidden');
    sidebarContent.innerHTML = '<div id="loading">Loading&hellip;</div>';

    fetchDetail(id, function (d) {
      if (!d) { sidebarContent.innerHTML = '<p class="error">Failed to load photo details.</p>'; return; }
        var previewUrl = safeUrl(d.preview) || safeUrl(d.thumb);
        var thumbUrl = safeUrl(d.thumb);
        var sourceUrl = safeUrl(d.url);

        var wrap = document.createElement('div');
        wrap.className = 'photo-wrap';
        if (previewUrl) {
          var link = document.createElement('a');
          link.href = previewUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          var img = document.createElement('img');
          img.alt = d.title || '';
          img.src = previewUrl;
          if (thumbUrl && thumbUrl !== previewUrl) {
            img.onerror = function () { this.src = thumbUrl; this.onerror = null; };
          }
          link.appendChild(img);
          wrap.appendChild(link);
        }

        var meta = document.createElement('div');
        meta.className = 'meta';

        function addP(cls, text) {
          var p = document.createElement('p');
          p.className = cls;
          p.textContent = text;
          meta.appendChild(p);
        }

        if (d.title) {
          var h2 = document.createElement('h2');
          h2.textContent = d.title;
          meta.appendChild(h2);
        }
        var locParts = [d.address, d.neighborhood].filter(Boolean);
        if (locParts.length) addP('address', locParts.join(' · '));
        if (d.date)          addP('date', d.date);
        if (d.description)   addP('description', d.description);
        if (d.notes)         addP('notes', d.notes);
        var attrParts = [d.photographer, d.collection, d.record_group].filter(Boolean);
        if (attrParts.length) addP('attribution', attrParts.join(' · '));
        if (d.rights)        addP('rights', d.rights);
        if (sourceUrl) {
          var a = document.createElement('a');
          a.className = 'source-link';
          a.href = sourceUrl;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'View on PhillyHistory.org →';
          meta.appendChild(a);
        }

        sidebarContent.innerHTML = '';
        sidebarContent.appendChild(wrap);
        sidebarContent.appendChild(meta);
    });
  }

  // --- Markers & clustering ---

  const clusters = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 8,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 16,
  });
  map.addLayer(clusters);

  var allMarkers = []; // all L.marker objects, loaded lazily in batches
  var BATCH = 2000;

  function makeMarker(lat, lon, id, year) {
    var m = L.marker([lat, lon]);
    m._recId = id;
    m._recYear = year; // 0 = unknown
    m.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      openSidebar(m._recId);
    });
    return m;
  }

  // Add an already-created array of markers to the cluster in batches.
  function addInBatches(list, idx) {
    var end = Math.min(idx + BATCH, list.length);
    clusters.addLayers(list.slice(idx, end));
    if (end < list.length) setTimeout(function () { addInBatches(list, end); }, 0);
  }

  // Create markers from raw data in batches, storing in allMarkers.
  function createInBatches(raw, idx) {
    var end = Math.min(idx + BATCH, raw.length);
    var batch = [];
    for (var i = idx; i < end; i++) {
      batch.push(makeMarker(raw[i][0], raw[i][1], raw[i][2], raw[i][3] || 0));
    }
    allMarkers = allMarkers.concat(batch);
    if (filterRanges === null) clusters.addLayers(batch);
    if (end < raw.length) setTimeout(function () { createInBatches(raw, end); }, 0);
  }

  // --- Year filter ---

  var filterRanges = null; // null = no filter; array of [from, to] pairs

  function parseYearFilter(str) {
    if (!str.trim()) return null;
    var ranges = [];
    str.split(',').forEach(function (part) {
      part = part.trim();
      var range = part.match(/^(\d{4})\s*-\s*(\d{4})$/);
      if (range) {
        ranges.push([+range[1], +range[2]]);
      } else if (/^\d{4}$/.test(part)) {
        ranges.push([+part, +part]);
      }
    });
    return ranges.length ? ranges : null;
  }

  function matchesFilter(year) {
    if (!filterRanges) return true;
    if (!year) return false;
    for (var i = 0; i < filterRanges.length; i++) {
      if (year >= filterRanges[i][0] && year <= filterRanges[i][1]) return true;
    }
    return false;
  }

  function applyFilter() {
    clusters.clearLayers();
    var filtered = filterRanges
      ? allMarkers.filter(function (m) { return matchesFilter(m._recYear); })
      : allMarkers;
    addInBatches(filtered, 0);
  }

  var filterTimer;
  document.getElementById('year-filter').addEventListener('input', function () {
    clearTimeout(filterTimer);
    var val = this.value;
    filterTimer = setTimeout(function () {
      filterRanges = parseYearFilter(val);
      applyFilter();
    }, 400);
  });

  // --- Load markers ---

  fetch('markers.json')
    .then(function (r) { return r.json(); })
    .then(function (raw) { createInBatches(raw, 0); })
    .catch(function (err) { console.error('Failed to load markers:', err); });
})();
