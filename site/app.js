(function () {
  "use strict";

  var isMobile = window.innerWidth <= 600;

  // City Hall, Philadelphia
  const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView(
    [39.9526, -75.1652],
    16,
  );

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  ).addTo(map);

  // --- Address search (Nominatim geocoder, wired to title-card input) ---
  const geocoder = L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
      countrycodes: "us",
      viewbox: "-75.35,39.85,-74.95,40.15",
      bounded: 0,
    },
  });
  const addressInput = document.getElementById("address-search");
  addressInput.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var q = addressInput.value.trim();
    if (!q) return;
    geocoder.geocode(q, function (results) {
      if (results && results.length) map.fitBounds(results[0].bbox);
    });
  });

  // --- Sidebar ---
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const closeBtn = document.getElementById("close-btn");

  function closeSidebar() {
    sidebar.classList.add("hidden");
    clearSelected();
  }
  closeBtn.addEventListener("click", closeSidebar);
  map.on("click", closeSidebar);

  // --- Modal / lightbox ---
  const modal = document.getElementById("modal");
  const modalImg = document.getElementById("modal-img");
  const modalPrev = document.getElementById("modal-prev");
  const modalNext = document.getElementById("modal-next");
  const modalCaption = document.getElementById("modal-caption");

  var modalRecs = [];
  var modalIdx = 0;

  function openModal(recs, startIdx) {
    modalRecs = recs;
    showModalAt(startIdx);
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
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
    if (modal.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") showModalAt(modalIdx - 1);
    else if (e.key === "ArrowRight") showModalAt(modalIdx + 1);
    else if (e.key === "Escape") closeModal();
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
        if (data) {
          byChunk[key].forEach(function (id) {
            if (data[id]) results[id] = data[id];
          });
        }
        if (--pending === 0) cb(results);
      });
    });
  }

  // --- Render detail panel (single-photo location) ---
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

  // --- Open sidebar (lazy, paged grid for multi-photo locations) ---
  var PAGE = 30;
  var sidebarGen = 0;
  var sidebarScroll = null; // active grid scroll handler, removed on re-open

  function openSidebar(rawIds) {
    var ids = rawIds.map(safeId).filter(Boolean);
    if (!ids.length) return;
    var gen = ++sidebarGen;
    if (sidebarScroll) {
      sidebar.removeEventListener("scroll", sidebarScroll);
      sidebarScroll = null;
    }
    sidebar.classList.remove("hidden");
    sidebar.scrollTop = 0;
    sidebarContent.innerHTML = '<div id="loading">Loading&hellip;</div>';

    // Single photo: show full detail view.
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
      });
      return;
    }

    // Multiple photos: header + sticky "now viewing" detail + lazy paged grid.
    sidebarContent.innerHTML = "";
    var note = document.createElement("p");
    note.className = "photo-count";
    note.textContent = ids.length + " photos at this location";
    sidebarContent.appendChild(note);

    // Sticky panel showing meta for the photo currently nearest the top.
    var active = document.createElement("div");
    active.className = "active-detail";
    sidebarContent.appendChild(active);

    var grid = document.createElement("div");
    grid.className = "photo-grid";
    sidebarContent.appendChild(grid);

    var sentinel = document.createElement("div");
    sentinel.className = "grid-sentinel";
    sidebarContent.appendChild(sentinel);

    var loadedRecs = []; // contiguous; index === position in ids that resolved
    var nextStart = 0; // index into ids of next page to fetch
    var loading = false;
    var activeIdx = -1;
    var visible = new Set(); // recIdx of thumbs currently in the focus band

    function setActive(idx) {
      if (idx === activeIdx || idx < 0 || !loadedRecs[idx]) return;
      activeIdx = idx;
      active.innerHTML = "";
      renderActiveDetail(loadedRecs[idx], active, loadedRecs, idx);
    }

    // Scroll-spy: a thumb counts as "current" only in the top band of the
    // sidebar; the topmost such thumb drives the detail panel.
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var i = +e.target.dataset.recIdx;
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        });
        if (visible.size) setActive(Math.min.apply(null, [...visible]));
      },
      { root: sidebar, rootMargin: "0px 0px -65% 0px" },
    );

    // True when the sentinel (grid bottom) is within ~600px of the visible
    // sidebar bottom — i.e. the user is near the end and we should fetch more.
    function nearBottom() {
      var sr = sidebar.getBoundingClientRect();
      var br = sentinel.getBoundingClientRect();
      return br.top - sr.bottom < 600;
    }

    function maybeLoad() {
      if (!loading && nextStart < ids.length && nearBottom()) loadPage();
    }
    sidebarScroll = maybeLoad;
    sidebar.addEventListener("scroll", maybeLoad);

    function loadPage() {
      if (loading || nextStart >= ids.length) return;
      loading = true;
      var slice = ids.slice(nextStart, nextStart + PAGE);
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
          });
          grid.appendChild(btn);
          spy.observe(btn);
        });
        loading = false;
        if (activeIdx < 0) setActive(0);
        if (nextStart >= ids.length) {
          sidebar.removeEventListener("scroll", maybeLoad);
          sentinel.remove();
          if (!loadedRecs.length) renderError();
        } else {
          // Keep filling until the viewport is covered (deferred to let the
          // browser lay out the new rows so nearBottom() is accurate).
          setTimeout(maybeLoad, 0);
        }
      });
    }

    loadPage();
  }

  // Compact meta panel for the active photo (no large image - the grid
  // already shows the picture; this surfaces title/description/etc).
  function renderActiveDetail(d, container, recs, recIdx) {
    function addP(cls, text) {
      var p = document.createElement("p");
      p.className = cls;
      p.textContent = text;
      container.appendChild(p);
    }
    if (d.title) {
      var h3 = document.createElement("h2");
      h3.textContent = d.title;
      h3.style.cursor = "pointer";
      h3.title = "View full size";
      h3.addEventListener("click", function () {
        openModal(recs, recIdx);
      });
      container.appendChild(h3);
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
    var sourceUrl = safeUrl(d.url);
    if (sourceUrl) {
      var a = document.createElement("a");
      a.className = "source-link";
      a.href = sourceUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "View on PhillyHistory.org →";
      container.appendChild(a);
    }
  }

  function renderError() {
    var err = document.createElement("p");
    err.className = "error";
    err.textContent = "Failed to load photo details.";
    sidebarContent.appendChild(err);
  }

  // --- Markers (canvas-rendered dots, no clustering) ---
  // Single canvas renderer keeps thousands of dots smooth.
  var dotRenderer = L.canvas({ padding: 0.5 });
  var dotLayer = L.layerGroup().addTo(map);

  function dotStyle(count, selected) {
    // Small dots — keep readable even at neighborhood zoom.
    // Mobile even smaller to avoid overlap on tiny screens.
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

  // selected-marker highlight
  var selectedMarker = null;
  var selectedCount = 0;
  function clearSelected() {
    if (selectedMarker) {
      selectedMarker.setStyle(dotStyle(selectedCount, false));
      selectedMarker.setRadius(dotStyle(selectedCount, false).radius);
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

  // spatialIndex: [[lat, lon, [ids...], [years...]], ...]  loaded once from markers.json
  // addedSet: tracks which indices have been added (never removed, prevents flicker)
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
      openSidebar(ids || entry[2]);
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

  // Returns a filtered ids array for the entry, null if all pass, [] if none match.
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

  // Dots are cheap on canvas, but instantiating all 32K markers at once is not.
  // Keep viewport culling; gate slightly so we never dump the whole city at once.
  // Higher threshold on mobile — small screen = fewer pixels = zoom out = more overlap.
  var MIN_LOAD_ZOOM = 14;

  function loadViewport() {
    var zoom = map.getZoom();
    if (zoom < MIN_LOAD_ZOOM) return;
    var pad = zoom >= 15 ? 0.3 : zoom >= 14 ? 0.2 : 0.1;
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

  // --- Bootstrap ---
  fetch("markers.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (raw) {
      spatialIndex = raw;
      loadViewport();
      updateZoomHint();
    })
    .catch(function (err) {
      console.error("Failed to load markers:", err);
    });
})();
