document.addEventListener('DOMContentLoaded', function () {
    const filterButtons = document.querySelectorAll('.filter-button');
    const galleryItems = document.querySelectorAll('.image-container, .video-container');

    let activeTag = null; // Track the currently active tag
    let isAnimating = false; // Track whether an animation is in progress
    let animationTimeout; // Store the timeout ID for clearing if needed

    filterButtons.forEach(button => {
        button.addEventListener('click', function () {
            if (isAnimating) return; // Prevent new actions if an animation is in progress
            clearTimeout(animationTimeout); // Clear previous timeout if it exists
            isAnimating = true; // Mark that an animation is starting

            const tag = this.getAttribute('data-tag');
            const isActive = this.classList.contains('active');

            // Reset active state of buttons and update based on current action
            filterButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.disabled = true; // Disable the button temporarily
            });
            if (!isActive || activeTag !== tag) {
                this.classList.add('active');
                activeTag = tag; // Update the active tag
            } else {
                activeTag = null; // Reset active tag if the same button was pressed again
            }

            // Apply "move away" animation to all items initially
            galleryItems.forEach(item => {
                item.classList.remove('animate-move-in');
                item.classList.add('animate-move-away');
            });

            // Delay applying "move in" animation to allow "move away" to fully complete
            animationTimeout = setTimeout(() => {
                galleryItems.forEach(item => {
                    const tags = item.getAttribute('data-tags').split(' ');
                    if (tags.includes(tag) || tag === 'all' || activeTag === null) {
                        item.style.display = 'block';
                        item.classList.remove('animate-move-away');
                        item.classList.add('animate-move-in');
                    } else {
                        if (item.classList.contains('animate-move-away')) {
                            item.style.display = 'none';
                        }
                    }
                });

                // Re-enable buttons after animations have completed
                filterButtons.forEach(btn => {
                    btn.disabled = false;
                });
                isAnimating = false; // Mark that animations have completed
            }, 200); // Adjust this delay to match the "move away" animation duration
        });
    });

    // Listen for animation end event and adjust display property accordingly
    galleryItems.forEach(item => {
        item.addEventListener('animationend', function () {
            if (item.classList.contains('animate-move-away')) {
                item.style.display = 'none';
            }
            item.classList.remove('animate-move-away', 'animate-move-in');
        });
    });
});