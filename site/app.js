(function () {
  "use strict";

  var isMobile = window.innerWidth <= 600;

  // --- Map ---
  const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(
    [39.9526, -75.1652],
    16,
  );
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  ).addTo(map);

  // Disable Leaflet keyboard nav when sidebar or modal are active —
  // otherwise arrow keys pan the map while navigating photos.
  function disableMapKeys() {
    map.keyboard.disable();
  }
  function enableMapKeys() {
    if (
      modal.classList.contains("hidden") &&
      sidebar.classList.contains("hidden")
    ) {
      map.keyboard.enable();
    }
  }

  // --- Title card collapse (auto-collapsed on mobile) ---
  (function () {
    var card = document.getElementById("title-card");
    var btn = document.getElementById("title-toggle");
    function sync() {
      btn.textContent = card.classList.contains("collapsed") ? "▸" : "▾";
    }
    if (isMobile) card.classList.add("collapsed");
    sync();
    btn.addEventListener("click", function () {
      card.classList.toggle("collapsed");
      sync();
    });
  })();

  // --- Address search ---
  const geocoder = L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
      countrycodes: "us",
      viewbox: "-75.35,39.85,-74.95,40.15",
      bounded: 0,
    },
  });
  document
    .getElementById("address-search")
    .addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var q = this.value.trim();
      if (!q) return;
      geocoder.geocode(q, function (results) {
        if (results && results.length) map.fitBounds(results[0].bbox);
      });
    });

  // --- Security ---
  var ALLOWED_ORIGIN = "https://www.phillyhistory.org/";
  function safeUrl(url) {
    return typeof url === "string" && url.startsWith(ALLOWED_ORIGIN)
      ? url
      : null;
  }
  function safeId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  }

  // --- Chunk fetching ---
  var chunkCache = {};
  var CHUNK_SIZE = 500;

  function fetchChunk(chunkId, cb) {
    if (chunkId in chunkCache) {
      cb(chunkCache[chunkId]);
      return;
    }
    fetch("chunks/" + chunkId + ".json")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        chunkCache[chunkId] = data;
        cb(data);
      })
      .catch(function () {
        chunkCache[chunkId] = null;
        cb(null);
      });
  }

  function fetchMultiple(ids, cb) {
    var byChunk = {};
    ids.forEach(function (id) {
      var key = String(Math.floor(parseInt(id, 10) / CHUNK_SIZE));
      if (!byChunk[key]) byChunk[key] = [];
      byChunk[key].push(id);
    });
    var keys = Object.keys(byChunk);
    if (!keys.length) {
      cb({});
      return;
    }
    var pending = keys.length;
    var results = {};
    keys.forEach(function (key) {
      fetchChunk(parseInt(key, 10), function (data) {
        if (data)
          byChunk[key].forEach(function (id) {
            if (data[id]) results[id] = data[id];
          });
        if (--pending === 0) cb(results);
      });
    });
  }

  // --- Sidebar ---
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const closeBtn = document.getElementById("close-btn");

  function closeSidebar() {
    if (sidebarScroll) {
      sidebar.removeEventListener("scroll", sidebarScroll);
      sidebarScroll = null;
    }
    sidebar.classList.add("hidden");
    clearSelected();
    enableMapKeys();
    updateHash(null, null);
  }
  closeBtn.addEventListener("click", closeSidebar);
  map.on("click", closeSidebar);

  // --- Modal ---
  const modal = document.getElementById("modal");
  const modalImg = document.getElementById("modal-img");
  const modalPrev = document.getElementById("modal-prev");
  const modalNext = document.getElementById("modal-next");
  const modalCaption = document.getElementById("modal-caption");

  var modalRecs = [];
  var modalIdx = 0;
  var modalLocationIds = null; // ids of current location for permalink

  function openModal(recs, startIdx, locationIds) {
    modalRecs = recs;
    modalLocationIds = locationIds || null;
    showModalAt(startIdx);
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    disableMapKeys();
  }

  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
    enableMapKeys();
  }

  function showModalAt(idx) {
    idx = Math.max(0, Math.min(idx, modalRecs.length - 1));
    modalIdx = idx;
    var d = modalRecs[idx];
    var url = safeUrl(d.preview) || safeUrl(d.thumb);
    modalImg.src = url || "";
    modalImg.alt = d.title || "";
    var cap = [d.title, d.date].filter(Boolean).join(" · ");
    modalCaption.textContent =
      modalRecs.length > 1
        ? cap + "  (" + (idx + 1) + " / " + modalRecs.length + ")"
        : cap;
    modalPrev.classList.toggle("hidden", idx === 0);
    modalNext.classList.toggle("hidden", idx === modalRecs.length - 1);
    // Update hash with photo id for permalinking
    if (currentLocEntry) updateHash(currentLocEntry, d.id);
    // Track recently viewed
    trackViewed(d.id);
  }

  document
    .getElementById("modal-backdrop")
    .addEventListener("click", closeModal);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  modalPrev.addEventListener("click", function () {
    showModalAt(modalIdx - 1);
  });
  modalNext.addEventListener("click", function () {
    showModalAt(modalIdx + 1);
  });

  document.addEventListener("keydown", function (e) {
    if (!modal.classList.contains("hidden")) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        showModalAt(modalIdx - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        showModalAt(modalIdx + 1);
      } else if (e.key === "Escape") closeModal();
    }
  });

  // --- Single-photo detail (sidebar) ---
  function renderDetail(d, container, recs, recIdx) {
    var previewUrl = safeUrl(d.preview) || safeUrl(d.thumb);
    var thumbUrl = safeUrl(d.thumb);
    var sourceUrl = safeUrl(d.url);

    if (previewUrl) {
      var wrap = document.createElement("div");
      wrap.className = "photo-wrap";
      var img = document.createElement("img");
      img.alt = d.title || "";
      img.loading = "lazy";
      img.src = previewUrl;
      if (thumbUrl && thumbUrl !== previewUrl) {
        img.onerror = function () {
          this.src = thumbUrl;
          this.onerror = null;
        };
      }
      wrap.appendChild(img);
      wrap.addEventListener("click", function () {
        openModal(recs, recIdx);
      });
      container.appendChild(wrap);
    }

    var meta = document.createElement("div");
    meta.className = "meta";
    function addP(cls, text) {
      var p = document.createElement("p");
      p.className = cls;
      p.textContent = text;
      meta.appendChild(p);
    }
    if (d.title) {
      var h2 = document.createElement("h2");
      h2.textContent = d.title;
      meta.appendChild(h2);
    }
    var locParts = [d.address, d.neighborhood].filter(Boolean);
    if (locParts.length) addP("address", locParts.join(" · "));
    if (d.date) addP("date", d.date);
    if (d.description) addP("description", d.description);
    if (d.notes) addP("notes", d.notes);
    var attrParts = [d.photographer, d.collection, d.record_group].filter(
      Boolean,
    );
    if (attrParts.length) addP("attribution", attrParts.join(" · "));
    if (d.rights) addP("rights", d.rights);
    if (sourceUrl) {
      var a = document.createElement("a");
      a.className = "source-link";
      a.href = sourceUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "View on PhillyHistory.org →";
      meta.appendChild(a);
    }
    container.appendChild(meta);
  }

  // Compact sticky meta: just title + date + link.
  // Clicking title or the expand button opens full detail in modal.
  function renderActiveDetail(d, container, recs, recIdx) {
    var row = document.createElement("div");
    row.className = "active-meta-row";

    if (d.title) {
      var h = document.createElement("span");
      h.className = "active-title";
      h.textContent = d.title;
      h.title = "Click to view full size";
      h.addEventListener("click", function () {
        openModal(recs, recIdx);
      });
      row.appendChild(h);
    }
    var right = document.createElement("span");
    right.className = "active-right";
    if (d.date) {
      var yr = document.createElement("span");
      yr.className = "active-date";
      yr.textContent = d.date;
      right.appendChild(yr);
    }
    var sourceUrl = safeUrl(d.url);
    if (sourceUrl) {
      var a = document.createElement("a");
      a.className = "active-link";
      a.href = sourceUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "↗";
      a.title = "View on PhillyHistory.org";
      right.appendChild(a);
    }
    row.appendChild(right);
    container.appendChild(row);

    if (d.description) {
      var desc = document.createElement("p");
      desc.className = "active-desc";
      desc.textContent = d.description;
      container.appendChild(desc);
    }
  }

  // --- Open sidebar ---
  var PAGE = 60;
  var PRELOAD_PX = 1200; // load next page when sentinel is this close to bottom
  var sidebarGen = 0;
  var sidebarScroll = null;
  var currentLocEntry = null; // [[lat,lon,ids,years]] entry for permalink

  // opts: { entry, years, header } — all optional.
  //   entry:  location entry [lat,lon,ids,years] for permalink (location view)
  //   years:  array parallel to rawIds for year-sort (search results)
  //   header: override header text (search results)
  function openSidebar(rawIds, opts) {
    opts = opts || {};
    var locEntry = opts.entry || null;
    var ids = rawIds.map(safeId).filter(Boolean);
    if (!ids.length) return;
    var gen = ++sidebarGen;
    currentLocEntry = locEntry;

    if (sidebarScroll) {
      sidebar.removeEventListener("scroll", sidebarScroll);
      sidebarScroll = null;
    }
    sidebar.classList.remove("hidden");
    sidebar.scrollTop = 0;
    disableMapKeys();
    sidebarContent.innerHTML = '<div id="loading">Loading&hellip;</div>';

    if (ids.length === 1) {
      fetchMultiple(ids, function (records) {
        if (gen !== sidebarGen) return;
        var d = records[ids[0]];
        sidebarContent.innerHTML = "";
        if (!d) {
          renderError();
          return;
        }
        renderDetail(d, sidebarContent, [d], 0);
        if (locEntry) updateHash(locEntry, d.id);
        trackViewed(d.id);
      });
      return;
    }

    sidebarContent.innerHTML = "";

    // Header: count + sort control
    var header = document.createElement("div");
    header.className = "grid-header";
    var countEl = document.createElement("span");
    countEl.className = "photo-count";
    countEl.textContent =
      opts.header || ids.length + " photos at this location";
    header.appendChild(countEl);

    var sortSel = document.createElement("select");
    sortSel.className = "sort-select";
    [
      ["default", "Default order"],
      ["year-asc", "Year: oldest"],
      ["year-desc", "Year: newest"],
    ].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0];
      opt.textContent = o[1];
      sortSel.appendChild(opt);
    });
    header.appendChild(sortSel);
    sidebarContent.appendChild(header);

    // Sticky compact meta panel (updated by scroll-spy)
    var active = document.createElement("div");
    active.className = "active-detail";
    sidebarContent.appendChild(active);

    var grid = document.createElement("div");
    grid.className = "photo-grid";
    sidebarContent.appendChild(grid);

    var sentinel = document.createElement("div");
    sentinel.className = "grid-sentinel";
    sidebarContent.appendChild(sentinel);

    // --- Sort ---
    // Years parallel to ids: from opts.years (search) or locEntry[3] (location).
    var rawYears = opts.years || (locEntry ? locEntry[3] : null);
    var idYearPairs = ids.map(function (id, i) {
      return { id: id, year: rawYears ? rawYears[i] : 0 };
    });

    function getSortedIds() {
      var sort = sortSel.value;
      if (sort === "year-asc") {
        return idYearPairs
          .slice()
          .sort(function (a, b) {
            return (a.year || 0) - (b.year || 0);
          })
          .map(function (x) {
            return x.id;
          });
      }
      if (sort === "year-desc") {
        return idYearPairs
          .slice()
          .sort(function (a, b) {
            return (b.year || 0) - (a.year || 0);
          })
          .map(function (x) {
            return x.id;
          });
      }
      return ids.slice();
    }

    var sortedIds = ids.slice();

    function rebuildGrid() {
      sortedIds = getSortedIds();
      grid.innerHTML = "";
      loadedRecs = [];
      nextStart = 0;
      loading = false;
      activeIdx = -1;
      visible.clear();
      active.innerHTML = "";
      sidebar.scrollTop = 0;
      loadPage();
    }

    sortSel.addEventListener("change", rebuildGrid);

    // --- Infinite scroll state ---
    var loadedRecs = [];
    var nextStart = 0;
    var loading = false;
    var activeIdx = -1;
    var visible = new Set();

    // Scroll-spy: topmost visible thumb → drives active-detail
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var i = +e.target.dataset.recIdx;
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        });
        if (visible.size) setActive(Math.min.apply(null, [...visible]));
      },
      { root: sidebar, rootMargin: "0px 0px -60% 0px" },
    );

    function setActive(idx) {
      if (idx === activeIdx || idx < 0 || !loadedRecs[idx]) return;
      activeIdx = idx;
      active.innerHTML = "";
      renderActiveDetail(loadedRecs[idx], active, loadedRecs, idx);
    }

    // Preemptive load: fires when sentinel is within PRELOAD_PX of sidebar bottom
    function nearBottom() {
      var sr = sidebar.getBoundingClientRect();
      var br = sentinel.getBoundingClientRect();
      return br.top - sr.bottom < PRELOAD_PX;
    }

    function maybeLoad() {
      if (!loading && nextStart < sortedIds.length && nearBottom()) loadPage();
    }

    sidebarScroll = maybeLoad;
    sidebar.addEventListener("scroll", maybeLoad);

    function loadPage() {
      if (loading || nextStart >= sortedIds.length) return;
      loading = true;
      var slice = sortedIds.slice(nextStart, nextStart + PAGE);
      nextStart += slice.length;
      fetchMultiple(slice, function (records) {
        if (gen !== sidebarGen) return;
        slice.forEach(function (id) {
          var d = records[id];
          if (!d) return;
          var recIdx = loadedRecs.length;
          loadedRecs.push(d);
          var thumbUrl = safeUrl(d.thumb) || safeUrl(d.preview);
          var btn = document.createElement("img");
          btn.className = "grid-thumb";
          btn.loading = "lazy";
          btn.dataset.recIdx = recIdx;
          if (thumbUrl) btn.src = thumbUrl;
          btn.alt = d.title || "";
          btn.title = [d.title, d.date].filter(Boolean).join(" · ");
          btn.addEventListener("click", function () {
            openModal(loadedRecs, recIdx);
            if (locEntry) updateHash(locEntry, d.id);
          });
          grid.appendChild(btn);
          spy.observe(btn);
        });
        loading = false;
        if (activeIdx < 0 && loadedRecs.length) setActive(0);
        if (nextStart >= sortedIds.length) {
          sidebar.removeEventListener("scroll", maybeLoad);
          sidebarScroll = null;
          sentinel.remove();
          if (!loadedRecs.length) renderError();
        } else {
          // Re-check after layout — keeps filling until viewport covered
          setTimeout(maybeLoad, 50);
        }
      });
    }

    loadPage();
  }

  function renderError() {
    var err = document.createElement("p");
    err.className = "error";
    err.textContent = "Failed to load photo details.";
    sidebarContent.appendChild(err);
  }

  // --- Markers ---
  var dotRenderer = L.canvas({ padding: 0.5 });
  var dotLayer = L.layerGroup().addTo(map);

  function dotStyle(count, selected) {
    var base = isMobile ? 2 : 3;
    var max = isMobile ? 5 : 7;
    var r = count <= 1 ? base : Math.min(base + Math.sqrt(count) * 0.55, max);
    return {
      renderer: dotRenderer,
      radius: selected ? r + 3 : r,
      color: selected ? "#0b3d91" : "#7b1111",
      fillColor: selected ? "#1d6fe0" : "#c0392b",
      fillOpacity: 0.85,
      weight: 1.5,
    };
  }

  var selectedMarker = null;
  var selectedCount = 0;
  function clearSelected() {
    if (selectedMarker) {
      var s = dotStyle(selectedCount, false);
      selectedMarker.setStyle(s);
      selectedMarker.setRadius(s.radius);
      selectedMarker = null;
    }
  }
  function setSelected(marker, count) {
    clearSelected();
    selectedMarker = marker;
    selectedCount = count;
    var s = dotStyle(count, true);
    marker.setStyle(s);
    marker.setRadius(s.radius);
    marker.bringToFront();
  }

  var spatialIndex = [];
  var addedSet = new Set();
  var BATCH = 800;

  function addInBatches(list, idx) {
    var end = Math.min(idx + BATCH, list.length);
    for (var i = idx; i < end; i++) dotLayer.addLayer(list[i]);
    if (end < list.length)
      setTimeout(function () {
        addInBatches(list, end);
      }, 0);
  }

  function makeLocationMarker(entry, ids) {
    var count = ids ? ids.length : entry[2].length;
    var m = L.circleMarker([entry[0], entry[1]], dotStyle(count, false));
    m.on("click", function (e) {
      L.DomEvent.stopPropagation(e);
      setSelected(m, count);
      openSidebar(ids || entry[2], { entry: entry });
      updateHash(entry, null);
    });
    return m;
  }

  // --- Year filter ---
  var filterRanges = null;

  function parseYearFilter(str) {
    if (!str.trim()) return null;
    var ranges = [];
    str.split(",").forEach(function (part) {
      part = part.trim();
      var m = part.match(/^(\d{4})\s*-\s*(\d{4})$/);
      if (m) ranges.push([+m[1], +m[2]]);
      else if (/^\d{4}$/.test(part)) ranges.push([+part, +part]);
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

  function filteredIds(entry) {
    if (!filterRanges) return null;
    var ids = entry[2],
      years = entry[3];
    if (!years) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (yearMatches(years[i])) out.push(ids[i]);
    }
    return out;
  }

  var MIN_LOAD_ZOOM = 14;

  function loadViewport() {
    var zoom = map.getZoom();
    if (zoom < MIN_LOAD_ZOOM) return;
    var pad = zoom >= 15 ? 0.3 : 0.2;
    var b = map.getBounds().pad(pad);
    var minLat = b.getSouth(),
      maxLat = b.getNorth();
    var minLng = b.getWest(),
      maxLng = b.getEast();
    var toAdd = [];
    for (var i = 0; i < spatialIndex.length; i++) {
      if (addedSet.has(i)) continue;
      var e = spatialIndex[i];
      if (e[0] < minLat || e[0] > maxLat || e[1] < minLng || e[1] > maxLng)
        continue;
      var fids = filteredIds(e);
      if (fids !== null && fids.length === 0) continue;
      addedSet.add(i);
      toAdd.push(makeLocationMarker(e, fids));
    }
    if (toAdd.length) addInBatches(toAdd, 0);
  }

  var zoomHint = document.getElementById("zoom-hint");
  function updateZoomHint() {
    zoomHint.style.display = map.getZoom() < MIN_LOAD_ZOOM ? "block" : "none";
  }

  function applyFilter() {
    closeSidebar();
    dotLayer.clearLayers();
    addedSet.clear();
    selectedMarker = null;
    loadViewport();
  }

  map.on("moveend zoomend", function () {
    loadViewport();
    updateZoomHint();
  });

  var filterTimer;
  document.getElementById("year-filter").addEventListener("input", function () {
    clearTimeout(filterTimer);
    var val = this.value;
    filterTimer = setTimeout(function () {
      filterRanges = parseYearFilter(val);
      applyFilter();
    }, 400);
  });

  // --- Permalink via URL hash: #loc=lat,lon or #loc=lat,lon&photo=id ---
  function updateHash(entry, photoId) {
    if (!entry) {
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    var h = "loc=" + entry[0] + "," + entry[1];
    if (photoId) h += "&photo=" + photoId;
    history.replaceState(null, "", "#" + h);
  }

  function parseHash() {
    var h = location.hash.slice(1);
    if (!h) return null;
    var params = {};
    h.split("&").forEach(function (p) {
      var kv = p.split("=");
      if (kv.length === 2) params[kv[0]] = kv[1];
    });
    if (!params.loc) return null;
    var ll = params.loc.split(",");
    if (ll.length !== 2) return null;
    return {
      lat: parseFloat(ll[0]),
      lon: parseFloat(ll[1]),
      photoId: params.photo || null,
    };
  }

  // --- Recently viewed (localStorage, last 50 photo IDs) ---
  var VIEWED_KEY = "oldphilly_viewed";
  function trackViewed(id) {
    try {
      var list = JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]");
      list = [id]
        .concat(
          list.filter(function (x) {
            return x !== id;
          }),
        )
        .slice(0, 50);
      localStorage.setItem(VIEWED_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable */
    }
  }

  // --- Fuzzy search (Enter-triggered, ranked) ---
  // search.json: { ids: [...], t: [lowercased text, ...] } — ~2.4MB gzipped,
  // loaded lazily on first search. Also build id→[lat,lon,year] for fly-to/sort.
  var searchData = null;
  var searchLoading = false;
  var idToLoc = null; // id → [lat, lon, year]

  function buildIdToLoc() {
    if (idToLoc) return;
    idToLoc = Object.create(null);
    for (var i = 0; i < spatialIndex.length; i++) {
      var e = spatialIndex[i];
      var ids = e[2],
        years = e[3];
      for (var k = 0; k < ids.length; k++) {
        idToLoc[ids[k]] = [e[0], e[1], years ? years[k] : 0];
      }
    }
  }

  // Subsequence fuzzy score. Returns score (higher better) or -1 if no match.
  // Bonuses: contiguous run, match at word start, early position.
  function fuzzyScore(needle, hay) {
    var ni = 0,
      score = 0,
      run = 0,
      hi = 0;
    var prevMatch = -2;
    for (hi = 0; hi < hay.length && ni < needle.length; hi++) {
      if (hay[hi] === needle[ni]) {
        var bonus = 0;
        if (hi === prevMatch + 1) {
          run++;
          bonus += run * 3;
        } else {
          run = 0;
        }
        if (hi === 0 || hay[hi - 1] === " ") bonus += 8; // word start
        bonus += Math.max(0, 10 - hi * 0.05); // earliness
        score += 1 + bonus;
        prevMatch = hi;
        ni++;
      }
    }
    return ni === needle.length ? score : -1;
  }

  // A record matches a multi-term query if every term fuzzy-matches; the
  // record's score is the sum of per-term scores.
  function searchRecords(query) {
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var ids = searchData.ids,
      texts = searchData.t;
    var results = [];
    for (var i = 0; i < texts.length; i++) {
      var hay = texts[i];
      var total = 0,
        ok = true;
      for (var t = 0; t < terms.length; t++) {
        var s = fuzzyScore(terms[t], hay);
        if (s < 0) {
          ok = false;
          break;
        }
        total += s;
      }
      if (ok) {
        // year filter (if active) applies as AND
        if (filterRanges) {
          buildIdToLoc();
          var loc = idToLoc[ids[i]];
          if (!loc || !yearMatches(loc[2])) continue;
        }
        results.push([ids[i], total]);
      }
    }
    results.sort(function (a, b) {
      return b[1] - a[1];
    });
    return results.slice(0, 150);
  }

  var SEARCH_LIMIT = 150;

  function runSearch(query) {
    query = query.trim();
    if (!query) return;
    if (!searchData) {
      if (searchLoading) return;
      searchLoading = true;
      sidebar.classList.remove("hidden");
      sidebar.scrollTop = 0;
      sidebarContent.innerHTML =
        '<div id="loading">Loading search index&hellip;</div>';
      fetch("search.json")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          searchData = data;
          searchLoading = false;
          runSearch(query);
        })
        .catch(function () {
          searchLoading = false;
          sidebarContent.innerHTML =
            '<p class="error">Search index failed to load.</p>';
        });
      return;
    }

    var results = searchRecords(query);
    if (!results.length) {
      sidebar.classList.remove("hidden");
      sidebar.scrollTop = 0;
      sidebarContent.innerHTML =
        '<p class="error">No matches for "' +
        query.replace(/[<>&"]/g, "") +
        '".</p>';
      return;
    }
    buildIdToLoc();
    var ids = results.map(function (r) {
      return r[0];
    });
    var years = ids.map(function (id) {
      var loc = idToLoc[id];
      return loc ? loc[2] : 0;
    });
    var capped = results.length >= SEARCH_LIMIT;
    openSidebar(ids, {
      years: years,
      header:
        (capped ? "top " + SEARCH_LIMIT : results.length) +
        ' results for "' +
        query +
        '"',
    });
  }

  var searchInput = document.getElementById("photo-search");
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") runSearch(this.value);
  });

  // --- Bootstrap ---
  document.getElementById("random-btn").addEventListener("click", function () {
    if (!spatialIndex.length) return;
    var e = spatialIndex[Math.floor(Math.random() * spatialIndex.length)];
    map.setView([e[0], e[1]], 16);
    setTimeout(function () {
      loadViewport();
      updateZoomHint();
      openSidebar(e[2], { entry: e });
      updateHash(e, null);
    }, 300);
  });

  fetch("markers.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (raw) {
      spatialIndex = raw;

      // Restore from hash if present
      var parsed = parseHash();
      if (parsed) {
        var targetLat = parsed.lat,
          targetLon = parsed.lon;
        // Find closest entry to hashed coords
        var best = null,
          bestDist = Infinity;
        for (var i = 0; i < spatialIndex.length; i++) {
          var e = spatialIndex[i];
          var d = Math.abs(e[0] - targetLat) + Math.abs(e[1] - targetLon);
          if (d < bestDist) {
            bestDist = d;
            best = { e: e, i: i };
          }
        }
        if (best && bestDist < 0.01) {
          map.setView([best.e[0], best.e[1]], 16);
          // Let viewport load first, then open sidebar
          setTimeout(function () {
            loadViewport();
            updateZoomHint();
            openSidebar(best.e[2], { entry: best.e });
          }, 300);
          return;
        }
      }

      loadViewport();
      updateZoomHint();
    })
    .catch(function (err) {
      console.error("Failed to load markers:", err);
    });
})();
