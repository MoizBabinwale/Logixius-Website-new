document.addEventListener('DOMContentLoaded', () => {
    // Mobile Navigation
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const links = document.querySelectorAll('.nav-links li');

    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        document.body.classList.toggle('menu-open'); // Toggle scroll lock
        const icon = hamburger.querySelector('i');
        if (navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });

    links.forEach(link => {
        if (!link.classList.contains('dropdown')) {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                document.body.classList.remove('menu-open'); // Remove scroll lock
                if (hamburger.querySelector('i')) {
                    hamburger.querySelector('i').classList.remove('fa-times');
                    hamburger.querySelector('i').classList.add('fa-bars');
                }
            });
        }
    });

    // Mobile Dropdown Toggle
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                // Only handle click for dropdown on mobile
                if (window.innerWidth <= 768) {
                    e.preventDefault(); // Prevent default link behavior
                    dropdown.classList.toggle('open');
                }
            });
        }
    });

    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Fade In Animations on Scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in-up').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });

    // Number Counter Animation
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counters = entry.target.querySelectorAll('.counter');
                counters.forEach(counter => {
                    const target = +counter.innerText.replace(/\D/g, ''); // Extract number
                    const suffix = counter.innerText.replace(/\d/g, ''); // Extract suffix like + or %
                    const duration = 2000; // 2 seconds
                    const increment = target / (duration / 16); // 60fps

                    let current = 0;
                    const updateCounter = () => {
                        current += increment;
                        if (current < target) {
                            counter.innerText = Math.ceil(current) + suffix;
                            requestAnimationFrame(updateCounter);
                        } else {
                            counter.innerText = target + suffix;
                        }
                    };
                    updateCounter();
                });
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const statsSection = document.querySelector('.stats-section');
    if (statsSection) {
        counterObserver.observe(statsSection);
    }

    // =========================================
    // LIGHTBOX GALLERY LOGIC (CATEGORY BASED)
    // =========================================
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const captionText = document.getElementById('caption');
    const closeBtn = document.querySelector('.close-lightbox');
    const prevBtn = document.querySelector('.prev');
    const nextBtn = document.querySelector('.next');
    const thumbnailContainer = document.querySelector('.lightbox-thumbnails');

    // Select ALL images (visible + hidden) that have a category OR are in the gallery grid
    const allGalleryImages = Array.from(document.querySelectorAll('img[data-category], .gallery-grid img'));

    // This will hold the subset of images for the currently active category
    let currentCategoryImages = [];
    let currentIndex = 0;

    const updateThumbnails = (index) => {
        // Clear existing thumbnails
        thumbnailContainer.innerHTML = '';

        // Generate thumbnails ONLY for the current category
        currentCategoryImages.forEach((img, i) => {
            const thumb = document.createElement('img');
            thumb.src = img.src;
            thumb.classList.add('thumbnail-img');
            if (i === index) {
                thumb.classList.add('active-thumb');
            }
            thumb.addEventListener('click', (e) => {
                e.stopPropagation();
                showLightbox(i);
            });
            thumbnailContainer.appendChild(thumb);
        });

        // Scroll active thumbnail into view
        const newThumbs = document.querySelectorAll('.thumbnail-img');
        if (newThumbs[index]) {
            newThumbs[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    };

    const showLightbox = (index, direction = null) => {
        currentIndex = index;
        const img = currentCategoryImages[currentIndex];

        lightbox.style.display = "block";

        // Remove existing animation classes to restart animation
        lightboxImg.classList.remove('slide-next', 'slide-prev');
        void lightboxImg.offsetWidth; // Force reflow

        // Apply animation if direction is provided
        if (direction === 'next') {
            lightboxImg.classList.add('slide-next');
        } else if (direction === 'prev') {
            lightboxImg.classList.add('slide-prev');
        }

        lightboxImg.src = img.src;

        // Try to get caption from the sibling .gallery-info h5 and p (only for visible images) or use Category Name
        const category = img.getAttribute('data-category');
        const info = img.nextElementSibling; // .gallery-info

        let title = category;
        let subtitle = '';

        if (info && info.classList.contains('gallery-info')) {
            title = info.querySelector('h5') ? info.querySelector('h5').innerText : (category || 'Image Details');
            subtitle = info.querySelector('p') ? info.querySelector('p').innerText : '';
        } else if (!category) {
            title = 'Gallery Image';
        }

        captionText.innerHTML = `<strong>${title}</strong><br>${subtitle}`;

        updateThumbnails(index);
        document.body.style.overflow = 'hidden'; // Lock scroll
    };

    const closeLightbox = () => {
        lightbox.style.display = "none";
        document.body.style.overflow = 'auto'; // Unlock scroll
    };

    const adjustIndex = (direction) => {
        let newIndex = currentIndex + direction;
        if (newIndex >= currentCategoryImages.length) {
            newIndex = 0;
        } else if (newIndex < 0) {
            newIndex = currentCategoryImages.length - 1;
        }
        showLightbox(newIndex, direction === 1 ? 'next' : 'prev');
    };

    // Event Listeners for Visible Images
    // We filter the main list to find only those matching the clicked category
    const visibleGalleryImages = Array.from(document.querySelectorAll('.gallery-grid .gallery-item img'));

    visibleGalleryImages.forEach((img) => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = img.getAttribute('data-category');

            if (category) {
                // Filter images by this category
                currentCategoryImages = allGalleryImages.filter(image => image.getAttribute('data-category') === category);
            } else {
                // For General Gallery, use all images in the grid
                currentCategoryImages = Array.from(document.querySelectorAll('.gallery-grid img'));
            }

            // Find index of clicked image in the new subset
            const clickedIndex = currentCategoryImages.findIndex(i => i.src === img.src);

            showLightbox(clickedIndex !== -1 ? clickedIndex : 0);
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    // Determine direction for animation based on click
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustIndex(-1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); adjustIndex(1); });

    // Close on outside click
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            // Close if clicking overlay or thumbnail container background
            if (e.target === lightbox || e.target === thumbnailContainer) {
                closeLightbox();
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (lightbox.style.display === "block") {
            if (e.key === "Escape") closeLightbox();
            if (e.key === "ArrowLeft") adjustIndex(-1);
            if (e.key === "ArrowRight") adjustIndex(1);
        }
    });
});
