// vidPause.js — Pauses other videos when one starts playing
// Listens for 'projectsRendered' so it works with dynamically added videos

function initVidPause() {
  const videos = document.querySelectorAll('#gallery .vid');

  videos.forEach(video => {
    video.addEventListener('play', function () {
      videos.forEach(otherVideo => {
        if (otherVideo !== video) {
          otherVideo.pause();
        }
      });
    });
  });
}

document.addEventListener('projectsRendered', initVidPause);
document.addEventListener('DOMContentLoaded', initVidPause);
