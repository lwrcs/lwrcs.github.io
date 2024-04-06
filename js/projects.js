// Define your projects as objects with properties

/* Template
{
        title: "",
        name: "",
        tags: ["", "", "", "", "", ""],
        poster: "img/thumbnail/.jpg",
        src: "img/portfolio/.mov",
        roles: "",
        links: {
            spotify: "",
            soundcloud: "",
            appleMusic: "",
            youtube: "",
            tidal: "",
            deezer: ""
        }
    },
    */

const projects = [
  {
    title: "6-Ball Coin Collector Showcase",
    name: "District VI",
    tags: ["project", "3d", "anim", "promo"],
    poster: "img/thumbnail/districtvi.jpg",
    src: "img/portfolio/District VI Animation.mp4",
    roles: "3D Modeling/Animation, Sound Design",
    links: {
      vimeo: "https://vimeo.com/924164176",
    },
  },
  {
    title: "Club Promotion Animation",
    name: "BrainChildLabs",
    tags: ["project", "3d", "anim", "promo"],
    poster: "img/thumbnail/brainchild.jpg",
    src: "img/portfolio/brainchildvisual-4k.mp4",
    roles: "3D Modeling/Animation, Sound Design",
  },
  {
    title: "Animated Music Video",
    name: "1nonly",
    tags: ["3d", "anim", "mv", "comm"],
    poster: "img/thumbnail/1nonly.jpg",
    src: "img/portfolio/skate music video.mov",
    roles: "Character Modeling, Environment Design, Rigging, Animation",
  },
  {
    title: "<3 Character",
    name: "lwrcs",
    tags: ["3d", "anim", "personal"],
    poster: "img/thumbnail/lwrcs wavy.jpg",
    src: "img/portfolio/lwrcs wavy.mp4",
    roles: "Character Animation",
  },
  {
    title: "DataBeasts Animation",
    tags: ["3d", "anim", "personal"],
    poster: "img/thumbnail/db.jpg",
    src: "img/portfolio/db sequence.mp4",
    roles: "Character Modeling, Environment Design, Rigging, Animation",
  },
  {
    title: "Merch Promotional Animation",
    name: "Meek Mill",
    tags: ["3d", "anim", "comm", "promo"],
    poster: "img/thumbnail/meek merch.jpg",
    src: "img/portfolio/meek merch.mp4",
    roles: "3D Modeling and Animation",
  },
  {
    title: "Seigaiha Edit",
    name: "B.A. Balis",
    tags: ["video", "promo"],
    poster: "img/thumbnail/seig.jpg",
    src: "img/portfolio/seig.mov",
    roles: "Filming, Editing, Color Grading",
  },
  {
    title: "Ice Logo",
    name: "lwrcs",
    tags: ["3d", "anim", "personal", "logo"],
    poster: "img/thumbnail/lwrcs_ice_rotate_loop.jpg",
    src: "img/portfolio/lwrcs_ice_rotate_loop.mp4",
    roles: "Logo Animation",
  },
  {
    title: "Pop-Up Shop Promotional Animation",
    name: "Torture",
    tags: ["3d", "anim", "comm", "promo"],
    poster: "img/thumbnail/TORTURE ARCADE.jpg",
    src: "img/portfolio/TORTURE ARCADE.mp4",
    roles: "Product Showcase, 3D Animation, Environment Design",
  },
  {
    title: "Trash Visual",
    name: "lwrcs",
    tags: ["3d", "anim", "personal", "mv", "music", "mymusic"],
    poster: "img/thumbnail/trashworld.jpg",
    src: "img/portfolio/trashworld-edit.mp4",
    roles: "Animation, Music Production",
  },
  {
    title: "Mystery Box Promotional Animation",
    name: "Torture",
    tags: ["3d", "anim", "comm", "promo"],
    poster: "img/thumbnail/torture mystery.jpg",
    src: "img/portfolio/torture mystery.mp4",
    roles: "3D Modeling, Animation, Sound design",
  },
  {
    title: "Glass Shatter Logo",
    name: "lwrcs",
    tags: ["3d", "anim", "personal", "logo"],
    poster: "img/thumbnail/glass0015-0200.jpg",
    src: "img/portfolio/glass0015-0200.mp4",
    roles: "Logo Animation",
  },
  {
    title: "Friday the 13th Merch Promotional Animation",
    name: "Torture",
    tags: ["3d", "anim", "comm", "promo"],
    poster: "img/thumbnail/torture friday.jpg",
    src: "img/portfolio/torture friday.mp4",
    roles: "Animation, Sound Design",
  },
  {
    title: "Rhinestone Hoodie Animation",
    name: "Torture",
    tags: ["3d", "anim", "comm", "promo"],
    poster: "img/thumbnail/Torture Rhinestone.jpg",
    src: "img/portfolio/Torture Rhinestone.mov",
    roles: "3D Modeling, Animation",
  },
  {
    title: '"lifetime" Visual',
    name: "lwrcs",
    tags: ["3d", "anim", "personal", "mv", "music", "mymusic"],
    poster: "img/thumbnail/lifetime.jpg",
    src: "img/portfolio/lifetime.mov",
    roles: "Character Animation, Rigging, Environment Design, Music Production",
    links: {
      spotify:
        "https://open.spotify.com/track/6YG9Ks60OTQ7NoB5UskUvu?si=23edbcd10af34749",
      soundcloud:
        "https://soundcloud.com/lwrcs/lifetime?si=b2ba7250e3514758bb1e21892dd752a3&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing",
      appleMusic:
        "https://music.apple.com/us/album/lifetime/1684156859?i=1684156863",
      youtube: "https://www.youtube.com/watch?v=ig8_XM-PW7A",
      tidal: "https://tidal.com/browse/track/290945229",
      deezer: "https://deezer.page.link/9MdYfpksgKXMLN9YA",
    },
  },
  {
    title: '"CatBoyDeathSquad" Visual',
    name: "lwrcs",
    tags: ["3d", "anim", "mv", "personal", "mymusic"],
    poster: "img/thumbnail/catboy.jpg",
    src: "img/portfolio/catboy.mp4",
    roles: "Music Production & Recording, 3D Animation",
    links: {
      spotify:
        "https://open.spotify.com/track/0OzpMO91x0BJpTVmckJbj9?si=f18951e4cf3c4cec",
      soundcloud:
        "https://soundcloud.com/lwrcs/catboydeathsquad-ft-sweatcult-xokeegan-zzbleed",
      appleMusic:
        "https://music.apple.com/us/album/catboydeathsquad-feat-sweatcult-xokeegan-zzbleed/1641044836?i=1641044837",
      youtube: "https://www.youtube.com/watch?v=2nckiRMGhaE",
      tidal: "https://tidal.com/browse/track/244269837",
      deezer: "https://deezer.page.link/gi4jBxfzJYUgVWDS6",
    },
  },
  // Add more projects as needed
];
