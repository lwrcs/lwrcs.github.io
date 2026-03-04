// alternateGallery.js — Expand / collapse logic for the alternate visuals gallery
// Requires: config.js (siteConfig), renderProjects.js (renders .alt-card elements)
//
// Behaviour:
//  - Clicking a thumbnail card expands it to a full-width "project container"
//  - The panel animates FROM the thumbnail's position/size TO the final centered position
//  - Other cards animate out of the way
//  - A 50% black overlay covers the background
//  - The nav header fades out
//  - The expanded view shows: video (with controls), description, and link icons
//  - Clicking the overlay or a close button collapses everything back to the thumbnail

(function () {
  "use strict";

  if (typeof siteConfig === "undefined" || !siteConfig.alternateVisuals) return;

  document.addEventListener("projectsRendered", init);

  var DURATION = 500; // ms — animation duration
  var PADDING = 32;   // px — panel padding on each side

  // --- State ---
  var expandedCard = null;
  var overlay = null;
  var expandedPanel = null;
  var lastThumbRect = null;
  var isAnimating = false;

  function init() {
    overlay = document.createElement("div");
    overlay.className = "alt-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", closeExpanded);

    var cards = document.querySelectorAll(".alt-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener("click", onCardClick);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && expandedCard) closeExpanded();
    });
  }

  // ---- Card click handler ----
  function onCardClick() {
    if (expandedCard || isAnimating) return;
    isAnimating = true;

    var card = this;
    expandedCard = card;

    var data = {
      title: card.getAttribute("data-title"),
      name: card.getAttribute("data-name"),
      roles: card.getAttribute("data-roles"),
      poster: card.getAttribute("data-poster"),
      src: card.getAttribute("data-src"),
      links: JSON.parse(card.getAttribute("data-links") || "{}"),
      youtubeId: card.getAttribute("data-youtube-id") || ""
    };

    // 1. Capture thumbnail viewport rect
    var thumb = card.querySelector(".alt-thumb");
    var thumbRect = thumb.getBoundingClientRect();
    lastThumbRect = {
      top: thumbRect.top,
      left: thumbRect.left,
      width: thumbRect.width,
      height: thumbRect.height
    };

    // 2. Show overlay
    overlay.classList.add("active");

    // 3. Hide nav header
    var navWrap = document.querySelector(".nav-wrap");
    if (navWrap) {
      navWrap.style.opacity = "0";
      navWrap.style.pointerEvents = "none";
    }

    // 4. Push other cards away
    var allCards = document.querySelectorAll(".alt-card");
    for (var i = 0; i < allCards.length; i++) {
      if (allCards[i] !== card) {
        allCards[i].classList.add("alt-card-hidden");
      }
    }

    // 5. Mark clicked card as expanding
    card.classList.add("alt-card-expanding");

    // 6. Build panel
    expandedPanel = buildExpandedPanel(data);
    document.body.appendChild(expandedPanel);

    // 7. Measure the natural content height.
    //    The video player's aspect-ratio CSS doesn't resolve off-screen, so we
    //    use the thumbnail image (same content, already loaded) to get the real
    //    aspect ratio and manually set the player's height during measurement.
    var finalW = Math.min(window.innerWidth * 0.9, 1200);

    // Get the video's true aspect ratio from the thumbnail
    var thumbImg = card.querySelector(".alt-thumb");
    var thumbNatW = thumbImg.naturalWidth || thumbImg.width;
    var thumbNatH = thumbImg.naturalHeight || thumbImg.height;
    var videoRatio = (thumbNatW && thumbNatH) ? thumbNatW / thumbNatH : 16 / 9;

    expandedPanel.style.cssText =
      "visibility:hidden; opacity:0; position:fixed; top:-9999px; left:0;" +
      "width:" + finalW + "px; height:auto; max-height:none; overflow:hidden;" +
      "padding:" + PADDING + "px; box-sizing:border-box;";
    expandedPanel.offsetHeight; // force layout

    // Set explicit pixel height on the video player based on its laid-out width
    // and the thumbnail's aspect ratio
    var player = expandedPanel.querySelector(".alt-video-player");
    if (player) {
      var playerW = player.getBoundingClientRect().width;
      player.style.height = Math.round(playerW / videoRatio) + "px";
      expandedPanel.offsetHeight; // re-layout with correct video height
    }

    var inner = expandedPanel.querySelector(".alt-inner");
    var innerH = inner.offsetHeight;
    var finalH = innerH + PADDING * 2;

    // Clear explicit player height so CSS takes over on-screen
    if (player) player.style.height = "";

    // Center vertically and horizontally
    var viewH = window.innerHeight;
    var finalTop = Math.round((viewH - finalH) / 2);
    var finalLeft = Math.round((window.innerWidth - finalW) / 2);

    // 8. Snap panel to thumbnail position (no transition)
    expandedPanel.style.cssText = "";
    applyStyles(expandedPanel, {
      position: "fixed",
      zIndex: "2000",
      boxSizing: "border-box",
      top: lastThumbRect.top + "px",
      left: lastThumbRect.left + "px",
      width: lastThumbRect.width + "px",
      height: lastThumbRect.height + "px",
      borderRadius: "8px",
      padding: "0px",
      overflow: "hidden",
      opacity: "1"
    });

    expandedPanel.offsetHeight; // force reflow

    // 9. Animate to final position
    expandedPanel.style.transition =
      "top " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "left " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "width " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "height " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "border-radius " + DURATION + "ms ease, " +
      "padding " + DURATION + "ms ease, " +
      "opacity 0.3s ease";

    expandedPanel.style.top = finalTop + "px";
    expandedPanel.style.left = finalLeft + "px";
    expandedPanel.style.width = finalW + "px";
    expandedPanel.style.height = finalH + "px";
    expandedPanel.style.borderRadius = "12px";
    expandedPanel.style.padding = PADDING + "px";
    expandedPanel.style.overflow = "hidden";

    // 10. After animation, switch to height:auto for a perfect fit and re-center
    setTimeout(function () {
      if (expandedPanel) {
        expandedPanel.style.transition = "none";
        expandedPanel.style.height = "auto";
        var newRect = expandedPanel.getBoundingClientRect();
        var newTop = Math.round((window.innerHeight - newRect.height) / 2);
        expandedPanel.style.top = newTop + "px";
        isAnimating = false;
      }
    }, DURATION + 50);
  }

  // ---- Helper: apply multiple styles ----
  function applyStyles(el, styles) {
    for (var prop in styles) {
      if (styles.hasOwnProperty(prop)) {
        el.style[prop] = styles[prop];
      }
    }
  }

  // ---- Build the expanded project panel ----
  function buildExpandedPanel(data) {
    var descSide = (typeof siteConfig !== "undefined" && siteConfig.alternateDescriptionSide) || "right";

    var panel = document.createElement("div");
    panel.className = "alt-expanded";
    if (descSide === "left") panel.classList.add("alt-desc-left");

    // --- Inner wrapper ---
    var inner = document.createElement("div");
    inner.className = "alt-inner";

    // --- Close button (on outer panel, position:absolute) ---
    var closeBtn = document.createElement("button");
    closeBtn.className = "alt-close-btn";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close project");
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeExpanded();
    });
    panel.appendChild(closeBtn);

    // --- Content wrapper (video + description side by side) ---
    var contentWrap = document.createElement("div");
    contentWrap.className = "alt-content-wrap";

    // -- Video area --
    var videoArea = document.createElement("div");
    videoArea.className = "alt-video-area";

    if (data.youtubeId) {
      var iframe = document.createElement("iframe");
      iframe.className = "alt-video-player";
      iframe.src = "https://www.youtube.com/embed/" + data.youtubeId + "?autoplay=0&rel=0";
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
      videoArea.appendChild(iframe);
    } else {
      var video = document.createElement("video");
      video.className = "alt-video-player";
      video.controls = true;
      video.preload = "metadata";
      video.poster = data.poster;

      video.addEventListener("loadedmetadata", function () {
        if (video.videoWidth && video.videoHeight) {
          video.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
        }
      });

      var source = document.createElement("source");
      source.src = data.src;
      source.type = "video/mp4";
      video.appendChild(source);
      videoArea.appendChild(video);
    }

    // -- Description area --
    var descArea = document.createElement("div");
    descArea.className = "alt-desc-area";

    if (data.title) {
      var h2 = document.createElement("h2");
      h2.className = "alt-desc-title";
      h2.textContent = data.title;
      descArea.appendChild(h2);
    }

    if (data.name) {
      var h3 = document.createElement("h3");
      h3.className = "alt-desc-name";
      h3.textContent = data.name;
      descArea.appendChild(h3);
    }

    if (data.roles) {
      var p = document.createElement("p");
      p.className = "alt-desc-roles";
      p.innerHTML = "<strong>Roles:</strong> " + data.roles;
      descArea.appendChild(p);
    }

    if (descSide === "left") {
      contentWrap.appendChild(descArea);
      contentWrap.appendChild(videoArea);
    } else {
      contentWrap.appendChild(videoArea);
      contentWrap.appendChild(descArea);
    }

    inner.appendChild(contentWrap);

    // --- Links bar ---
    var linkKeys = Object.keys(data.links);
    if (linkKeys.length > 0) {
      var linksBar = document.createElement("div");
      linksBar.className = "alt-links-bar";

      for (var i = 0; i < linkKeys.length; i++) {
        var key = linkKeys[i];
        var a = document.createElement("a");
        a.href = data.links[key];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "alt-link-icon";

        var img = document.createElement("img");
        img.src = "img/icon/" + key + ".png";
        img.alt = key;
        a.appendChild(img);
        linksBar.appendChild(a);
      }

      inner.appendChild(linksBar);
    }

    panel.appendChild(inner);
    return panel;
  }

  // ---- Close / collapse — animate back to thumbnail position ----
  function closeExpanded() {
    if (!expandedCard || isAnimating) return;
    isAnimating = true;

    var targetRect = lastThumbRect;

    if (expandedPanel && targetRect) {
      var currentRect = expandedPanel.getBoundingClientRect();
      expandedPanel.style.transition = "none";
      expandedPanel.style.top = currentRect.top + "px";
      expandedPanel.style.left = currentRect.left + "px";
      expandedPanel.style.width = currentRect.width + "px";
      expandedPanel.style.height = currentRect.height + "px";
      expandedPanel.style.overflow = "hidden";

      expandedPanel.offsetHeight; // force reflow

      expandedPanel.style.transition =
        "top " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "left " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "width " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "height " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "border-radius " + DURATION + "ms ease, " +
        "padding " + DURATION + "ms ease, " +
        "opacity 0.35s ease " + (DURATION * 0.4) + "ms";

      expandedPanel.style.top = targetRect.top + "px";
      expandedPanel.style.left = targetRect.left + "px";
      expandedPanel.style.width = targetRect.width + "px";
      expandedPanel.style.height = targetRect.height + "px";
      expandedPanel.style.borderRadius = "8px";
      expandedPanel.style.padding = "0px";
      expandedPanel.style.overflow = "hidden";
      expandedPanel.style.opacity = "0";
    }

    overlay.classList.remove("active");

    var navWrap = document.querySelector(".nav-wrap");
    if (navWrap) {
      navWrap.style.opacity = "1";
      navWrap.style.pointerEvents = "";
    }

    var allCards = document.querySelectorAll(".alt-card");
    for (var i = 0; i < allCards.length; i++) {
      allCards[i].classList.remove("alt-card-hidden");
    }

    expandedCard.classList.remove("alt-card-expanding");

    var panelRef = expandedPanel;
    setTimeout(function () {
      if (panelRef && panelRef.parentNode) {
        panelRef.parentNode.removeChild(panelRef);
      }
      isAnimating = false;
    }, DURATION + 100);

    expandedCard = null;
    expandedPanel = null;
    lastThumbRect = null;
  }
})();
