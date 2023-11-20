document.onreadystatechange = function () {
    if (document.readyState === "complete") {
        // Wait for the whole document to be ready
        // Introduce a delay (e.g., 1000 milliseconds) before hiding the loader
        setTimeout(function() {
            document.getElementById("loader-wrapper").style.display = "none";
        }, 1000);
    }
};