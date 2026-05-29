(function () {
  'use strict';

  // City Hall, Philadelphia
  const map = L.map('map', { zoomControl: true }).setView([39.9526, -75.1652], 16);

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
  const sidebar   = document.getElementById('sidebar');
  const sidebarContent = document.getElementById('sidebar-content');
  const closeBtn  = document.getElementById('close-btn');

  function closeSidebar() { sidebar.classList.add('hidden'); }
  closeBtn.addEventListener('click', closeSidebar);
  map.on('click', closeSidebar);

  // --- Modal / lightbox ---
  const modal      = document.getElementById('modal');
  const modalImg   = document.getElementById('modal-img');
  const modalPrev  = document.getElementById('modal-prev');
  const modalNext  = document.getElementById('modal-next');

  var modalRecs = [];
  var modalIdx  = 0;

  function openModal(recs, startIdx) {
    modalRecs = recs;
    showModalAt(startIdx);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function showModalAt(idx) {
    idx = Math.max(0, Math.min(idx, modalRecs.length - 1));
    modalIdx = idx;
    var d = modalRecs[idx];
    var url = safeUrl(d.preview) || safeUrl(d.thumb);
    modalImg.src = url || '';
    modalImg.alt = d.title || '';
    modalPrev.classList.toggle('hidden', idx === 0);
    modalNext.classList.toggle('hidden', idx === modalRecs.length - 1);
  }

  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalPrev.addEventListener('click', function () { showModalAt(modalIdx - 1); });
  modalNext.addEventListener('click', function () { showModalAt(modalIdx + 1); });

  document.addEventListener('keydown', function (e) {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft')  showModalAt(modalIdx - 1);
    else if (e.key === 'ArrowRight') showModalAt(modalIdx + 1);
    else if (e.key === 'Escape') closeModal();
  });

  // --- Security ---
  var ALLOWED_ORIGIN = 'https://www.phillyhistory.org/';
  function safeUrl(url) {
    return typeof url === 'string' && url.startsWith(ALLOWED_ORIGIN) ? url : null;
  }
  function safeId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  }

  // --- Chunk fetching ---
  var chunkCache = {};
  var CHUNK_SIZE = 500;

  function fetchChunk(chunkId, cb) {
    if (chunkId in chunkCache) { cb(chunkCache[chunkId]); return; }
    fetch('chunks/' + chunkId + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { chunkCache[chunkId] = data; cb(data); })
      .catch(function () { chunkCache[chunkId] = null; cb(null); });
  }

  function fetchMultiple(ids, cb) {
    var byChunk = {};
    ids.forEach(function (id) {
      var key = String(Math.floor(parseInt(id, 10) / CHUNK_SIZE));
      if (!byChunk[key]) byChunk[key] = [];
      byChunk[key].push(id);
    });
    var keys = Object.keys(byChunk);
    if (!keys.length) { cb({}); return; }
    var pending = keys.length;
    var results = {};
    keys.forEach(function (key) {
      fetchChunk(parseInt(key, 10), function (data) {
        if (data) {
          byChunk[key].forEach(function (id) {
            if (data[id]) results[id] = data[id];
          });
        }
        if (--pending === 0) cb(results);
      });
    });
  }

  // --- Render detail panel ---
  // sidebarRecs and sidebarActiveIdx are set by openSidebar before renderDetail is called.
  var sidebarRecs      = [];
  var sidebarActiveIdx = 0;

  function renderDetail(d, container, recIdx) {
    var previewUrl = safeUrl(d.preview) || safeUrl(d.thumb);
    var thumbUrl   = safeUrl(d.thumb);
    var sourceUrl  = safeUrl(d.url);

    if (previewUrl) {
      var wrap = document.createElement('div');
      wrap.className = 'photo-wrap';
      var img = document.createElement('img');
      img.alt = d.title || '';
      img.src = previewUrl;
      if (thumbUrl && thumbUrl !== previewUrl) {
        img.onerror = function () { this.src = thumbUrl; this.onerror = null; };
      }
      wrap.appendChild(img);
      wrap.addEventListener('click', function () {
        openModal(sidebarRecs, recIdx);
      });
      container.appendChild(wrap);
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
      a.href = sourceUrl; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'View on PhillyHistory.org →';
      meta.appendChild(a);
    }
    container.appendChild(meta);
  }

  // --- Open sidebar ---
  var MAX_PHOTOS = 24;
  var sidebarGen = 0;

  function openSidebar(rawIds) {
    var ids = rawIds.map(safeId).filter(Boolean);
    if (!ids.length) return;
    var gen = ++sidebarGen;
    sidebar.classList.remove('hidden');
    sidebarContent.innerHTML = '<div id="loading">Loading&hellip;</div>';

    var limited = ids.slice(0, MAX_PHOTOS);

    fetchMultiple(limited, function (records) {
      if (gen !== sidebarGen) return;
      var recs = limited.map(function (id) { return records[id]; }).filter(Boolean);
      sidebarRecs = recs;
      sidebarActiveIdx = 0;
      sidebarContent.innerHTML = '';

      if (!recs.length) {
        var err = document.createElement('p');
        err.className = 'error';
        err.textContent = 'Failed to load photo details.';
        sidebarContent.appendChild(err);
        return;
      }

      if (recs.length === 1) {
        renderDetail(recs[0], sidebarContent, 0);
        return;
      }

      var note = document.createElement('p');
      note.className = 'photo-count';
      note.textContent = (ids.length > MAX_PHOTOS)
        ? ids.length + ' photos at this location (showing first ' + MAX_PHOTOS + ')'
        : recs.length + ' photos at this location';
      sidebarContent.appendChild(note);

      var strip = document.createElement('div');
      strip.className = 'thumb-strip';
      sidebarContent.appendChild(strip);

      var detail = document.createElement('div');
      detail.className = 'detail-panel';
      sidebarContent.appendChild(detail);
      renderDetail(recs[0], detail, 0);

      recs.forEach(function (d, i) {
        var thumbUrl = safeUrl(d.thumb) || safeUrl(d.preview);
        var btn = document.createElement('img');
        btn.className = 'strip-thumb' + (i === 0 ? ' active' : '');
        if (thumbUrl) btn.src = thumbUrl;
        btn.alt = d.title || '';
        btn.title = [d.title, d.date].filter(Boolean).join(' · ');
        btn.addEventListener('click', function () {
          sidebarActiveIdx = i;
          strip.querySelectorAll('.strip-thumb').forEach(function (t) { t.classList.remove('active'); });
          btn.classList.add('active');
          detail.innerHTML = '';
          renderDetail(d, detail, i);
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        strip.appendChild(btn);
      });
    });
  }

  // --- Markers & clustering ---
  // maxClusterRadius is zoom-dependent: aggressive when zoomed out so overlapping
  // pins group into manageable clusters, minimal at street level.
  const clusters = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: function (zoom) {
      if (zoom <= 12) return 80;
      if (zoom <= 13) return 50;
      if (zoom <= 14) return 25;
      if (zoom <= 15) return 12;
      return 8;
    },
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 17,
    showCoverageOnHover: false,
  });
  map.addLayer(clusters);

  // Small red dot marker — much less visual noise than default blue pins.
  var DOT_STYLE = {
    radius: 5,
    color: '#7b1111',
    fillColor: '#c0392b',
    fillOpacity: 0.85,
    weight: 1.5,
  };

  // spatialIndex: [[lat, lon, [ids...], [years...]], ...]  loaded once from markers.json
  // addedSet: tracks which indices have been added (never removed, prevents cluster rebuild flicker)
  var spatialIndex = [];
  var addedSet = new Set();
  var BATCH = 500;

  function addInBatches(list, idx) {
    var end = Math.min(idx + BATCH, list.length);
    clusters.addLayers(list.slice(idx, end));
    if (end < list.length) setTimeout(function () { addInBatches(list, end); }, 0);
  }

  function makeLocationMarker(entry, ids) {
    var m = L.circleMarker([entry[0], entry[1]], DOT_STYLE);
    m.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      openSidebar(ids || entry[2]);
    });
    return m;
  }

  // --- Year filter ---
  var filterRanges = null;

  function parseYearFilter(str) {
    if (!str.trim()) return null;
    var ranges = [];
    str.split(',').forEach(function (part) {
      part = part.trim();
      var m = part.match(/^(\d{4})\s*-\s*(\d{4})$/);
      if (m) {
        ranges.push([+m[1], +m[2]]);
      } else if (/^\d{4}$/.test(part)) {
        ranges.push([+part, +part]);
      }
    });
    return ranges.length ? ranges : null;
  }

  function yearMatches(year) {
    if (!filterRanges || !year) return !filterRanges;
    for (var i = 0; i < filterRanges.length; i++) {
      if (year >= filterRanges[i][0] && year <= filterRanges[i][1]) return true;
    }
    return false;
  }

  // Returns a filtered ids array for the entry, or null if all pass.
  // Returns [] if no photos match (location should be hidden).
  function filteredIds(entry) {
    if (!filterRanges) return null;
    var ids = entry[2], years = entry[3];
    if (!years) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (yearMatches(years[i])) out.push(ids[i]);
    }
    return out;
  }

  // Don't load new markers below this zoom — prevents dumping 32K pins at city level.
  var MIN_LOAD_ZOOM = 13;

  function loadViewport() {
    var zoom = map.getZoom();
    if (zoom < MIN_LOAD_ZOOM) return;
    // Less buffer at lower zoom to limit how many markers are added at once.
    var pad = zoom >= 15 ? 0.3 : zoom >= 14 ? 0.15 : 0.05;
    var b = map.getBounds().pad(pad);
    var minLat = b.getSouth(), maxLat = b.getNorth();
    var minLng = b.getWest(),  maxLng = b.getEast();
    var toAdd = [];
    for (var i = 0; i < spatialIndex.length; i++) {
      if (addedSet.has(i)) continue;
      var e = spatialIndex[i];
      if (e[0] < minLat || e[0] > maxLat || e[1] < minLng || e[1] > maxLng) continue;
      var fids = filteredIds(e);
      if (fids !== null && fids.length === 0) continue;
      addedSet.add(i);
      toAdd.push(makeLocationMarker(e, fids));
    }
    if (toAdd.length) addInBatches(toAdd, 0);
  }

  var zoomHint = document.getElementById('zoom-hint');
  function updateZoomHint() {
    zoomHint.style.display = map.getZoom() < MIN_LOAD_ZOOM ? 'block' : 'none';
  }

  function applyFilter() {
    closeSidebar();
    clusters.clearLayers();
    addedSet.clear();
    loadViewport();
  }

  map.on('moveend zoomend', function () {
    loadViewport();
    updateZoomHint();
  });

  var filterTimer;
  document.getElementById('year-filter').addEventListener('input', function () {
    clearTimeout(filterTimer);
    var val = this.value;
    filterTimer = setTimeout(function () {
      filterRanges = parseYearFilter(val);
      applyFilter();
    }, 400);
  });

  // --- Bootstrap ---
  fetch('markers.json')
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      spatialIndex = raw;
      loadViewport();
      updateZoomHint();
    })
    .catch(function (err) { console.error('Failed to load markers:', err); });
})();
