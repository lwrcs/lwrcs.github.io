document.addEventListener("DOMContentLoaded", function () {
    var backToTopButton = document.getElementById("back-to-top");
    var isButtonVisible = false;

    // Show or hide the "Back to Top" button based on scroll position
    window.addEventListener("scroll", function () {
        var pageHeight = document.body.scrollHeight - window.innerHeight;
        var scrollPercentage = (window.pageYOffset / pageHeight) * 100; // Calculate scroll position as a percentage

        if (scrollPercentage > 10) { // Change this percentage as needed
            if (!isButtonVisible) {
                // Button wasn't visible, so fade it in
                backToTopButton.style.opacity = 1;
                isButtonVisible = true;
            }
        } else {
            if (isButtonVisible) {
                // Button was visible, so fade it out
                backToTopButton.style.opacity = 0;
                isButtonVisible = false;
            }
        }
    });

    // Scroll to the top of the page when the button is clicked
    backToTopButton.addEventListener("click", function () {
        window.scroll({ top: 0, left: 0, behavior: "smooth" });
    });
});
