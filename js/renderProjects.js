// Function to render projects
function renderProjects(startIndex = 0) {
  const gallery = document.getElementById("gallery");
  const projectTemplate = document.getElementById("project-template");
  const defaultVolume = 0.15; // Sets the default volume for all videos (0.0 is muted, 1.0 is maximum)

  // Adjust start index to 0-based if it's given as 1-based
  startIndex = startIndex - 1;

  // Render projects starting from startIndex or default order if no index is provided
  for (let i = startIndex; i < projects.length; i++) {
    const project = projects[i];
    if (!project || !project.visible) continue; // Skip if project is not defined or not visible

    // Clone the template content
    const projectNode = projectTemplate.content.cloneNode(true);

    // Set the data-tags attribute
    const videoContainer = projectNode.querySelector(".video-container");
    if (videoContainer && project.tags) {
      videoContainer.setAttribute("data-tags", project.tags.join(" "));
    }

    // Populate project data into the template
    const videoElement = projectNode.querySelector(".vid");
    videoElement.poster = project.poster;
    videoElement.innerHTML = `<source src="${project.src}" type="video/mp4" />`;
    videoElement.volume = defaultVolume; // Apply the default volume to the video element

    // Construct caption content conditionally based on non-null values
    let captionContent = "";
    if (project.title) captionContent += `${project.title}<br>`;
    if (project.name) captionContent += `${project.name}<br>`;
    if (project.roles)
      captionContent += `Roles: ${project.roles}`;

    // Set the constructed caption content
    projectNode.querySelector(".caption").innerHTML = captionContent;

    const bottomBar = projectNode.querySelector(".bottom-bar");
    if (project.links) {
      Object.keys(project.links).forEach((link) => {
        bottomBar.innerHTML += `
                    <div class="icon">
                        <a href="${project.links[link]}" target="_blank">
                            <img src="img/icon/${link}.png" alt="${link}">
                        </a>
                    </div>
                `;
      });
    }

    // Append the populated project to the container
    gallery.appendChild(projectNode);
    setTimeout(() => {
      videoElement.poster = project.poster;
    }, 0);  }
}

// Call the function to render projects
renderProjects(1); // Start rendering from the first project

// After dynamically adding content
if (window.initializeFilters) {
  window.initializeFilters();
}
