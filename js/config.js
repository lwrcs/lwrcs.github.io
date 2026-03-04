// config.js — Site-wide feature flags
// Load this script BEFORE any feature scripts that depend on it.
//
// To enable or disable a feature, set its value to true or false.

var siteConfig = {
  // Show the tag filter buttons on the visuals gallery page
  tagFilter: false,

  // Alternate visuals gallery: thumbnail-only cards that expand into
  // full-width project containers on click (replaces default video gallery)
  alternateVisuals: true,

  // When a project is expanded in alternate mode, show the text description
  // on the "right" or "left" side of the video (ignored on mobile — always below)
  alternateDescriptionSide: "right",
};
