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

  var DURATION = 250; // ms — animation duration
  var PADDING = 20;   // px — panel padding on each side
  var MARGIN = 24;    // px — gap between panel edge and viewport edge

  // --- State ---
  var expandedCard = null;
  var overlay = null;
  var expandedPanel = null;
  var lastThumbRect = null;
  var lastThumbSrc = null;
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
      description: card.getAttribute("data-description"),
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
    lastThumbSrc = thumb.src;

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

    // 5. Mark clicked card as expanding & hide original thumb
    card.classList.add("alt-card-expanding");

    // 6. Build panel
    expandedPanel = buildExpandedPanel(data);
    document.body.appendChild(expandedPanel);

    // 7. Measure the natural content height off-screen.
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;
    var finalW = Math.min(viewW - MARGIN * 2, 1200);

    var thumbImg = card.querySelector(".alt-thumb");
    var thumbNatW = thumbImg.naturalWidth || thumbImg.width;
    var thumbNatH = thumbImg.naturalHeight || thumbImg.height;
    var videoRatio = (thumbNatW && thumbNatH) ? thumbNatW / thumbNatH : 16 / 9;
    var maxVideoH = Math.round(viewH * 0.82);

    expandedPanel.style.cssText =
      "visibility:hidden; opacity:0; position:fixed; top:-9999px; left:0;" +
      "width:" + finalW + "px; height:auto; max-height:none; overflow:hidden;" +
      "padding:" + PADDING + "px; box-sizing:border-box;";
    expandedPanel.offsetHeight;

    var player = expandedPanel.querySelector(".alt-video-player");
    if (player) {
      var playerW = player.getBoundingClientRect().width;
      var naturalPlayerH = Math.round(playerW / videoRatio);
      var playerH = Math.min(naturalPlayerH, maxVideoH);
      player.style.height = playerH + "px";
      player.style.aspectRatio = "unset";
      if (playerH < naturalPlayerH) {
        player.style.width = Math.round(playerH * videoRatio) + "px";
      }
      expandedPanel.offsetHeight;
    }

    // Also measure where the video player will land in the final layout
    var playerFinalRect = player ? player.getBoundingClientRect() : null;

    var inner = expandedPanel.querySelector(".alt-inner");
    var innerH = inner.offsetHeight;
    var finalH = innerH + PADDING * 2;

    var maxPanelH = viewH - MARGIN * 2;
    if (finalH > maxPanelH) finalH = maxPanelH;

    var finalTop = Math.max(MARGIN, Math.round((viewH - finalH) / 2));
    var finalLeft = Math.max(MARGIN, Math.round((viewW - finalW) / 2));

    // Compute the video player's final viewport position.
    // During measurement the panel is at top:-9999px, so we offset by the
    // difference between the measurement top and the actual finalTop.
    var videoFinalRect = null;
    if (playerFinalRect) {
      var measuredPanelTop = expandedPanel.getBoundingClientRect().top;
      var offsetY = finalTop - measuredPanelTop;
      var offsetX = finalLeft - expandedPanel.getBoundingClientRect().left;
      videoFinalRect = {
        top: playerFinalRect.top + offsetY,
        left: playerFinalRect.left + offsetX,
        width: playerFinalRect.width,
        height: playerFinalRect.height
      };
    }

    // 8. Create a floating thumbnail clone that will animate from the
    //    original thumbnail position to the final video player position.
    var thumbClone = document.createElement("img");
    thumbClone.src = thumb.src;
    thumbClone.className = "alt-thumb-clone";
    applyStyles(thumbClone, {
      position: "fixed",
      zIndex: "2001",
      top: lastThumbRect.top + "px",
      left: lastThumbRect.left + "px",
      width: lastThumbRect.width + "px",
      height: lastThumbRect.height + "px",
      borderRadius: "8px",
      objectFit: "cover",
      pointerEvents: "none",
      margin: "0",
      padding: "0",
      display: "block"
    });
    document.body.appendChild(thumbClone);

    // 9. Position the panel at final size immediately but transparent,
    //    with the inner content hidden — it sits behind the thumbnail clone.
    expandedPanel.style.cssText = "";
    inner.style.opacity = "0";
    var closeBtn = expandedPanel.querySelector(".alt-close-btn");
    if (closeBtn) closeBtn.style.opacity = "0";

    applyStyles(expandedPanel, {
      position: "fixed",
      zIndex: "2000",
      boxSizing: "border-box",
      top: finalTop + "px",
      left: finalLeft + "px",
      width: finalW + "px",
      height: finalH + "px",
      borderRadius: "12px",
      padding: PADDING + "px",
      overflow: "hidden",
      opacity: "0"
    });
    expandedPanel.offsetHeight;

    // 9b. Start loading the YouTube iframe now
    var ytIframe = expandedPanel.querySelector("iframe[data-yt-src]");
    if (ytIframe) {
      ytIframe.src = ytIframe.getAttribute("data-yt-src");
      ytIframe.removeAttribute("data-yt-src");
    }

    // 10. Animate the thumbnail clone to the video player's final position
    //     Panel + content opacity are driven by a rAF loop tied to animation progress.
    thumbClone.offsetHeight; // force reflow

    var cloneTransition =
      "top " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "left " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "width " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "height " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
      "border-radius " + DURATION + "ms ease";

    thumbClone.style.transition = cloneTransition;

    if (videoFinalRect) {
      thumbClone.style.top = videoFinalRect.top + "px";
      thumbClone.style.left = videoFinalRect.left + "px";
      thumbClone.style.width = videoFinalRect.width + "px";
      thumbClone.style.height = videoFinalRect.height + "px";
    }
    thumbClone.style.borderRadius = "8px";

    // 11. rAF loop — drive panel bg, content, and clone opacity from progress
    var openStart = performance.now();
    var panelRef = expandedPanel;
    var innerRef = inner;
    var closeBtnRef = closeBtn;
    var cloneRef = thumbClone;
    var isYouTube = !!ytIframe;

    function openTick(now) {
      var elapsed = now - openStart;
      var t = Math.min(elapsed / DURATION, 1); // 0 → 1

      // Panel background fades in over the full duration
      if (panelRef) panelRef.style.opacity = String(t);

      // Content and close button fade in with the same progress
      if (innerRef) innerRef.style.opacity = String(t);
      if (closeBtnRef) closeBtnRef.style.opacity = String(t);

      if (!isYouTube) {
        // Non-YouTube: clone stays fully visible, then drops out in the last 15%
        var cloneOpacity = t < 0.85 ? 1 : 1 - ((t - 0.85) / 0.15);
        cloneRef.style.opacity = String(Math.max(0, cloneOpacity));
      }
      // YouTube: clone stays at full opacity until animation is done

      if (t < 1) {
        requestAnimationFrame(openTick);
      } else {
        // Animation complete — finalize panel
        if (!panelRef) return;

        panelRef.style.transition = "none";
        panelRef.style.height = "auto";
        panelRef.style.overflow = "hidden";

        var panelRect = panelRef.getBoundingClientRect();
        var vH = window.innerHeight;
        var vW = window.innerWidth;
        var panelH = panelRect.height;

        if (panelH > vH - MARGIN * 2) {
          panelRef.style.height = (vH - MARGIN * 2) + "px";
          panelRef.style.overflowY = "auto";
          panelH = vH - MARGIN * 2;
        }

        var newTop = Math.max(MARGIN, Math.round((vH - panelH) / 2));
        var newLeft = Math.max(MARGIN, Math.round((vW - panelRect.width) / 2));
        panelRef.style.top = newTop + "px";
        panelRef.style.left = newLeft + "px";

        // Clear inline opacity so CSS takes over
        if (innerRef) innerRef.style.opacity = "";
        if (closeBtnRef) closeBtnRef.style.opacity = "";

        // Fade out the clone 250ms after the panel is fully open
        var cloneToFade = cloneRef;
        setTimeout(function () {
          fadeOutClone(cloneToFade);
        }, 100);

        isAnimating = false;
      }
    }
    requestAnimationFrame(openTick);
  }

  // ---- Helper: crossfade a thumbnail clone out and remove it ----
  function fadeOutClone(clone) {
    if (!clone || !clone.parentNode) return;
    clone.style.transition = "opacity 0.2s ease";
    clone.style.opacity = "0";
    setTimeout(function () {
      if (clone.parentNode) clone.parentNode.removeChild(clone);
    }, 220);
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
      // Store the embed URL — we only set src after the panel is on-screen
      // to avoid error 150/153 from off-screen or file:// loading.
      iframe.setAttribute("data-yt-src",
        "https://www.youtube.com/embed/" + data.youtubeId);
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
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
      var rolesP = document.createElement("p");
      rolesP.className = "alt-desc-roles";
      rolesP.textContent = data.roles;
      descArea.appendChild(rolesP);
    }

    if (data.description) {
      var descP = document.createElement("p");
      descP.className = "alt-desc-text";
      descP.textContent = data.description;
      descArea.appendChild(descP);
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

  // ---- Close / collapse — animate thumbnail clone back to original position ----
  function closeExpanded() {
    if (!expandedCard || isAnimating) return;
    isAnimating = true;

    var targetRect = lastThumbRect;
    var panelRef = expandedPanel;

    if (expandedPanel && targetRect) {
      // 1. Find the video player's current viewport position
      var player = expandedPanel.querySelector(".alt-video-player");
      var videoArea = expandedPanel.querySelector(".alt-video-area");
      var startRect;
      if (player) {
        startRect = player.getBoundingClientRect();
      } else if (videoArea) {
        startRect = videoArea.getBoundingClientRect();
      } else {
        startRect = expandedPanel.getBoundingClientRect();
      }

      var inner = expandedPanel.querySelector(".alt-inner");
      var closeBtn = expandedPanel.querySelector(".alt-close-btn");

      // 2. Create a thumbnail clone at the video player's current position
      var thumbClone = document.createElement("img");
      thumbClone.src = lastThumbSrc || "";
      thumbClone.className = "alt-thumb-clone";
      applyStyles(thumbClone, {
        position: "fixed",
        zIndex: "2001",
        top: startRect.top + "px",
        left: startRect.left + "px",
        width: startRect.width + "px",
        height: startRect.height + "px",
        borderRadius: "8px",
        objectFit: "cover",
        pointerEvents: "none",
        margin: "0",
        padding: "0",
        display: "block",
        opacity: "0"
      });
      document.body.appendChild(thumbClone);
      thumbClone.offsetHeight; // force reflow

      // 3. Animate clone position via CSS transition
      thumbClone.style.transition =
        "top " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "left " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "width " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "height " + DURATION + "ms cubic-bezier(0.4,0,0.2,1), " +
        "border-radius " + DURATION + "ms ease";

      thumbClone.style.top = targetRect.top + "px";
      thumbClone.style.left = targetRect.left + "px";
      thumbClone.style.width = targetRect.width + "px";
      thumbClone.style.height = targetRect.height + "px";
      thumbClone.style.borderRadius = "8px";

      // 4. rAF loop — drive all opacity from animation progress (reverse)
      var closeStart = performance.now();

      function closeTick(now) {
        var elapsed = now - closeStart;
        var t = Math.min(elapsed / DURATION, 1); // 0 → 1

        // Panel bg + content fade out (1 → 0)
        var fadeOut = String(1 - t);
        if (panelRef) panelRef.style.opacity = fadeOut;
        if (inner) inner.style.opacity = fadeOut;
        if (closeBtn) closeBtn.style.opacity = fadeOut;

        // Thumbnail clone fades in (0 → 1), then back out in the last 30%
        var cloneOpacity;
        if (t < 0.7) {
          cloneOpacity = t / 0.7; // 0 → 1 over first 70%
        } else {
          cloneOpacity = 1 - ((t - 0.7) / 0.3); // 1 → 0 over last 30%
        }
        thumbClone.style.opacity = String(Math.max(0, cloneOpacity));

        if (t < 1) {
          requestAnimationFrame(closeTick);
        } else {
          // Done — clean up
          if (thumbClone.parentNode) thumbClone.parentNode.removeChild(thumbClone);
          if (panelRef && panelRef.parentNode) panelRef.parentNode.removeChild(panelRef);
          var clones = document.querySelectorAll(".alt-thumb-clone");
          for (var i = 0; i < clones.length; i++) {
            if (clones[i].parentNode) clones[i].parentNode.removeChild(clones[i]);
          }
          isAnimating = false;
        }
      }
      requestAnimationFrame(closeTick);
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

    expandedCard = null;
    expandedPanel = null;
    lastThumbRect = null;
    lastThumbSrc = null;
  }
})();
