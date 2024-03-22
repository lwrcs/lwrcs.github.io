// Find all video elements with the "vid" class
const videos = document.querySelectorAll('.vid');

// Set the initial volume for each video
videos.forEach((video) => {
    video.volume = 0.5; // Adjust the volume as needed (0.1 means 10%)
});
