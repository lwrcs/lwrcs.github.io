document.addEventListener('DOMContentLoaded', function() {
    const videoContainers = document.querySelectorAll('.video-container');

    videoContainers.forEach(container => {
        const video = container.querySelector('.vid');

        // Initially disable pointer events on the video to ignore clicks
        video.style.pointerEvents = '';

        const playVideo = () => {
            video.play()
                .then(() => {
                    // Once the video starts playing, re-enable pointer events and remove the click listener
                    video.style.pointerEvents = '';
                    container.removeEventListener('click', playVideo);
                })
                .catch(error => console.error('Error trying to play the video:', error));
        };

        container.addEventListener('click', playVideo);
    });
});
