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
      posterSrc = "https://img.youtube.com/vi/" + ytId + "/hqdefault.jpg";
    }

    // Store project data on the element for the expand script
    card.setAttribute("data-title", project.title || "");
    card.setAttribute("data-name", project.name || "");
    card.setAttribute("data-roles", project.roles || "");
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

    // Title overlay (visible on the card)
    var titleOverlay = document.createElement("div");
    titleOverlay.className = "alt-card-title";
    titleOverlay.textContent = project.title || "";

    card.appendChild(thumb);
    card.appendChild(titleOverlay);
    gallery.appendChild(card);
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
