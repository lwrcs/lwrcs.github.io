// renderProjects.js — Renders project data into the gallery
// Waits for projects.js to finish loading data before rendering.
// Supports two modes: default (video containers) and alternate (thumbnail cards).

function renderProjects() {
  var gallery = document.getElementById("gallery");
  var projectTemplate = document.getElementById("project-template");

  if (!gallery) return;

  var useAlternate = (typeof siteConfig !== "undefined" && siteConfig.alternateVisuals === true);

  if (useAlternate) {
    renderAlternateGallery(gallery);
  } else {
    renderDefaultGallery(gallery, projectTemplate);
  }

  // After all projects are in the DOM, initialize dependent systems
  if (window.initializeYouTubePlayers) {
    window.initializeYouTubePlayers();
  }

  if (window.initializeFilters) {
    window.initializeFilters();
  }

  // Dispatch a custom event so other scripts can bind to dynamic content
  document.dispatchEvent(new CustomEvent("projectsRendered"));
}

// --- Default gallery (original video containers) ---
function renderDefaultGallery(gallery, projectTemplate) {
  if (!projectTemplate) return;

  var defaultVolume = 0.15;

  for (var i = 0; i < projects.length; i++) {
    var project = projects[i];
    if (!project || !project.visible) continue;

    var projectNode = projectTemplate.content.cloneNode(true);

    var videoContainer = projectNode.querySelector(".video-container");
    if (videoContainer && project.tags) {
      videoContainer.setAttribute("data-tags", project.tags.join(" "));
    }

    var videoElement = projectNode.querySelector(".vid");
    if (project.links && project.links.youtube) {
      var youtubeID = extractYouTubeID(project.links.youtube);
      if (youtubeID) {
        videoElement.innerHTML = '<div class="youtube-player" data-video-id="' + youtubeID + '"></div>';
      }
    } else {
      videoElement.poster = project.poster;
      videoElement.setAttribute("data-src", project.src);
      videoElement.volume = defaultVolume;
    }

    var captionContent = "";
    if (project.title) captionContent += project.title + "<br>";
    if (project.name) captionContent += project.name + "<br>";
    if (project.roles) captionContent += "Roles: " + project.roles;
    projectNode.querySelector(".caption").innerHTML = captionContent;

    var bottomBar = projectNode.querySelector(".bottom-bar");
    if (project.links) {
      Object.keys(project.links).forEach(function (link) {
        bottomBar.innerHTML +=
          '<div class="icon">' +
            '<a href="' + project.links[link] + '" target="_blank" rel="noopener noreferrer">' +
              '<img src="img/icon/' + link + '.png" alt="' + link + '">' +
            '</a>' +
          '</div>';
      });
    }

    gallery.appendChild(projectNode);

    var posterSrc = project.poster;
    (function(el, src) {
      setTimeout(function() { el.poster = src; }, 0);
    })(videoElement, posterSrc);
  }
}

// --- Alternate gallery (thumbnail cards that expand) ---
function renderAlternateGallery(gallery) {
  // Add the alternate mode class to the gallery container
  gallery.classList.add("alt-gallery");

  var cards = [];

  for (var i = 0; i < projects.length; i++) {
    var project = projects[i];
    if (!project || !project.visible) continue;

    // Create the card element
    var card = document.createElement("div");
    card.className = "alt-card";
    card.setAttribute("data-project-index", i);
    if (project.tags) {
      card.setAttribute("data-tags", project.tags.join(" "));
    }

    // YouTube ID if applicable
    var ytId = "";
    if (project.links && project.links.youtube) {
      ytId = extractYouTubeID(project.links.youtube) || "";
    }

    // Resolve the thumbnail: use the local poster if available, otherwise
    // fall back to the YouTube-hosted thumbnail for YouTube projects.
    var posterSrc = project.poster || "";
    if (!posterSrc && ytId) {
      posterSrc = "https://img.youtube.com/vi/" + ytId + "/maxresdefault.jpg";
    }

    // Store project data on the element for the expand script
    card.setAttribute("data-title", project.title || "");
    card.setAttribute("data-name", project.name || "");
    card.setAttribute("data-roles", project.roles || "");
    card.setAttribute("data-description", project.description || "");
    card.setAttribute("data-poster", posterSrc);
    card.setAttribute("data-src", project.src || "");
    card.setAttribute("data-links", JSON.stringify(project.links || {}));
    if (ytId) card.setAttribute("data-youtube-id", ytId);

    // Thumbnail image (no video, no controls)
    var thumb = document.createElement("img");
    thumb.className = "alt-thumb";
    thumb.src = posterSrc;
    thumb.alt = (project.title || "Project") + " thumbnail";
    thumb.draggable = false;

    // maxresdefault.jpg isn't available for every YouTube video — YouTube
    // returns a 404 but still serves a tiny placeholder JPEG (~120×90) so
    // the browser's onerror never fires.  We detect the placeholder by
    // checking naturalWidth after load and fall back to lower-res options.
    if (ytId && !project.poster) {
      (function (imgEl, cardEl, id) {
        var fallbacks = [
          "https://img.youtube.com/vi/" + id + "/sddefault.jpg",
          "https://img.youtube.com/vi/" + id + "/hqdefault.jpg",
          "https://img.youtube.com/vi/" + id + "/mqdefault.jpg"
        ];
        var attempt = 0;

        function tryNext() {
          if (attempt < fallbacks.length) {
            var next = fallbacks[attempt++];
            imgEl.src = next;
            cardEl.setAttribute("data-poster", next);
          }
        }

        function onLoaded() {
          // YouTube's "no thumbnail" placeholder is 120×90
          if (imgEl.naturalWidth <= 120) {
            tryNext();
            return;
          }
          // Lower-res YouTube thumbnails are 4:3 with black letterbox bars.
          // Force-crop to 16:9 so the bars are hidden.
          if (imgEl.naturalWidth && imgEl.naturalHeight) {
            var ratio = imgEl.naturalWidth / imgEl.naturalHeight;
            // If the image is closer to 4:3 than 16:9, it's letterboxed
            if (ratio < 1.5) {
              imgEl.classList.add("alt-thumb-crop");
            }
          }
        }

        imgEl.addEventListener("load", onLoaded);
        imgEl.addEventListener("error", tryNext);

        // If the image was already cached and loaded synchronously, check now
        if (imgEl.complete && imgEl.naturalWidth <= 120) {
          tryNext();
        }
      })(thumb, card, ytId);
    }

    // Title overlay (visible on the card)
    var titleOverlay = document.createElement("div");
    titleOverlay.className = "alt-card-title";
    titleOverlay.textContent = project.title || "";

    card.appendChild(thumb);
    card.appendChild(titleOverlay);
    gallery.appendChild(card);
    cards.push(card);
  }

  // Run masonry layout once all thumbnail images have loaded
  masonryLayout(gallery, cards);
  waitForImages(cards, function () {
    masonryLayout(gallery, cards);
  });

  // Re-run on resize
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      masonryLayout(gallery, cards);
    }, 100);
  });
}

// --- JS masonry: place each card in the shortest column (preserves order) ---
var MASONRY_GAP = 20;

function getMasonryColumns() {
  var w = window.innerWidth;
  if (w <= 480) return 1;
  if (w <= 768) return 2;
  if (w >= 1400) return 4;
  return 3;
}

function masonryLayout(gallery, cards) {
  var numCols = getMasonryColumns();
  var galleryW = gallery.offsetWidth;
  var colW = (galleryW - MASONRY_GAP * (numCols - 1)) / numCols;
  var colHeights = [];
  for (var c = 0; c < numCols; c++) colHeights.push(0);

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];

    // Set width first so the browser can compute height
    card.style.width = colW + "px";

    // Find the shortest column
    var shortest = 0;
    for (var c = 1; c < numCols; c++) {
      if (colHeights[c] < colHeights[shortest]) shortest = c;
    }

    var x = shortest * (colW + MASONRY_GAP);
    var y = colHeights[shortest];

    card.style.left = x + "px";
    card.style.top = y + "px";

    // Measure the card's actual rendered height
    colHeights[shortest] += card.offsetHeight + MASONRY_GAP;
  }

  // Set the gallery container height so content below flows correctly
  var maxH = 0;
  for (var c = 0; c < numCols; c++) {
    if (colHeights[c] > maxH) maxH = colHeights[c];
  }
  gallery.style.height = (maxH - MASONRY_GAP) + "px";
}

// Wait for all thumbnail images inside the cards to finish loading
function waitForImages(cards, callback) {
  var total = 0;
  var loaded = 0;

  for (var i = 0; i < cards.length; i++) {
    var img = cards[i].querySelector("img");
    if (img && !img.complete) {
      total++;
      (function (imgEl) {
        imgEl.addEventListener("load", check);
        imgEl.addEventListener("error", check);
      })(img);
    }
  }

  if (total === 0) callback();

  function check() {
    loaded++;
    if (loaded >= total) callback();
  }
}

// Extract YouTube video ID from various URL formats
function extractYouTubeID(url) {
  const regex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Wait for project data to load, then render
window.projectsReady.then(() => renderProjects());
