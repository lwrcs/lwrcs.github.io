// tagFilter.js — Gallery filter by tag
// Supports URL hash-based filter selection (e.g. #3d)
// Respects siteConfig.tagFilter — when false, hides the filter UI entirely.

function initializeFilters() {
  var tagFilterWrapper = document.getElementById("tag-filter-container");

  // If disabled in config, hide the entire filter section and bail
  if (typeof siteConfig !== "undefined" && siteConfig.tagFilter === false) {
    if (tagFilterWrapper) tagFilterWrapper.style.display = "none";
    return;
  }

  const filterButtons = document.querySelectorAll(".filter-button");
  const galleryItems = document.querySelectorAll(".video-container");
  const tagFilterContainer = document.getElementById("tag-filter");

  // Guard: if filter UI doesn't exist on this page, skip
  if (!tagFilterContainer || !filterButtons.length) return;

  let activeTag = null;
  let isAnimating = false;
  let animationTimeout;

  function applyTagFilter(tag) {
    galleryItems.forEach((item) => {
      const tagsAttribute = item.getAttribute("data-tags");
      if (!tagsAttribute) return;

      const tags = tagsAttribute.split(" ");
      const shouldDisplay = tag === null || tags.includes(tag);

      item.classList.remove("animate-move-in");
      item.classList.add("animate-move-away");

      setTimeout(() => {
        if (shouldDisplay) {
          item.classList.remove("animate-move-away");
          item.classList.add("animate-move-in");
          item.style.display = "";
        } else {
          item.classList.remove("animate-move-in");
          item.style.display = "none";
        }
      }, 200);
    });
  }

  function selectFilterBasedOnURL() {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const targetButton = Array.from(filterButtons).find(
        (button) => button.getAttribute("data-tag") === hash
      );
      if (targetButton) {
        activeTag = hash;
        applyTagFilter(activeTag);
        targetButton.classList.add("active");
      }
    }
  }

  tagFilterContainer.addEventListener("click", function (event) {
    const target = event.target;
    if (!target.classList.contains("filter-button") || isAnimating) return;

    clearTimeout(animationTimeout);
    isAnimating = true;

    const tag = target.getAttribute("data-tag");
    if (activeTag !== tag) {
      filterButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.disabled = true;
      });
      target.classList.add("active");
      activeTag = tag;
    } else {
      target.classList.remove("active");
      activeTag = null;
    }

    galleryItems.forEach((item) => {
      if (!item.classList.contains("animate-move-away")) {
        setTimeout(() => {
          item.style.display = "none";
        }, 200);
      }
    });

    applyTagFilter(activeTag);

    animationTimeout = setTimeout(() => {
      filterButtons.forEach((btn) => (btn.disabled = false));
      isAnimating = false;
      galleryItems.forEach((item) => {
        if (item.classList.contains("animate-move-in")) {
          item.style.display = "block";
        }
      });
    }, 200);
  });

  selectFilterBasedOnURL();
}

document.addEventListener("DOMContentLoaded", initializeFilters);
document.addEventListener("projectsRendered", initializeFilters);
window.initializeFilters = initializeFilters;
