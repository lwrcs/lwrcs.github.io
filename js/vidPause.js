    document.addEventListener("DOMContentLoaded", function() {
        // Get all video elements within the gallery
        const videos = document.querySelectorAll('#gallery .vid');

        // Add event listener to each video element
        videos.forEach(video => {
            video.addEventListener('play', function() {
                // Pause all other videos
                videos.forEach(otherVideo => {
                    if (otherVideo !== video) {
                        otherVideo.pause();
                    }
                });
            });
        });
    });
