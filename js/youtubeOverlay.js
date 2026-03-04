// youtubeOverlay.js — YouTube IFrame API integration
// Manages overlay opacity based on player state

let youtubePlayers = [];

function onYouTubeIframeAPIReady() {
  const youtubeElements = document.querySelectorAll(".youtube-player");
  const overlays = document.querySelectorAll(".video-container .overlay");

  youtubeElements.forEach((element, index) => {
    const videoId = element.getAttribute("data-video-id");
    if (!videoId) return;

    const player = new YT.Player(element, {
      videoId: videoId,
      events: {
        onStateChange: function (event) {
          const overlay = overlays[index];
          if (!overlay) return;

          if (event.data === YT.PlayerState.PLAYING) {
            overlay.style.opacity = "0";
          } else if (
            event.data === YT.PlayerState.PAUSED ||
            event.data === YT.PlayerState.ENDED
          ) {
            overlay.style.opacity = "";
          }
        },
      },
    });

    youtubePlayers.push(player);
  });
}
