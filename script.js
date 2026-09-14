document.getElementById("year").textContent = new Date().getFullYear();

const siteHeader = document.querySelector(".site-header");
let lastScrollY = window.scrollY;

function updateHeaderState() {
  const currentScrollY = window.scrollY;

  if (currentScrollY > 20) {
    siteHeader.classList.add("is-scrolled");
  } else {
    siteHeader.classList.remove("is-scrolled");
  }

  if (currentScrollY > lastScrollY && currentScrollY > 120) {
    siteHeader.classList.add("is-hidden");
  } else {
    siteHeader.classList.remove("is-hidden");
  }

  lastScrollY = currentScrollY;
}

window.addEventListener("scroll", () => {
  window.requestAnimationFrame(updateHeaderState);
}, { passive: true });

const backToTopBtn = document.getElementById("back-to-top");

function updateBackToTopButton() {
  if (!backToTopBtn) return;
  const visible = window.scrollY > 320;
  backToTopBtn.classList.toggle("is-visible", visible);
}

window.addEventListener("scroll", () => {
  window.requestAnimationFrame(updateBackToTopButton);
}, { passive: true });

backToTopBtn?.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

/* Mobile nav toggle */
const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

navToggle.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

mainNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

/* Gallery filter */
const filterButtons = document.querySelectorAll(".filter-btn");
const tiles = Array.from(document.querySelectorAll(".tile"));

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const filter = btn.dataset.filter;
    tiles.forEach((tile) => {
      const match = filter === "all" || tile.dataset.cat === filter;
      tile.classList.toggle("is-hidden", !match);
    });
  });
});

/* Lightbox */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const closeBtn = document.getElementById("lightbox-close");
const prevBtn = document.getElementById("lightbox-prev");
const nextBtn = document.getElementById("lightbox-next");

let currentIndex = 0;

function visibleTiles() {
  return tiles.filter((t) => !t.classList.contains("is-hidden"));
}

function openLightbox(index) {
  const list = visibleTiles();
  if (!list.length) return;
  currentIndex = (index + list.length) % list.length;
  const tile = list[currentIndex];
  const img = tile.querySelector("img");
  const caption = tile.querySelector("figcaption");

  lightboxImg.src = img.src.replace(/\/\d+\/\d+$/, "/1400/1000");
  lightboxImg.alt = img.alt;
  lightboxCaption.textContent = caption ? caption.textContent : "";
  lightbox.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("is-open");
  document.body.style.overflow = "";
}

tiles.forEach((tile) => {
  tile.addEventListener("click", () => {
    const list = visibleTiles();
    openLightbox(list.indexOf(tile));
  });
});

closeBtn.addEventListener("click", closeLightbox);
prevBtn.addEventListener("click", () => openLightbox(currentIndex - 1));
nextBtn.addEventListener("click", () => openLightbox(currentIndex + 1));

lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("is-open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") openLightbox(currentIndex - 1);
  if (e.key === "ArrowRight") openLightbox(currentIndex + 1);
});