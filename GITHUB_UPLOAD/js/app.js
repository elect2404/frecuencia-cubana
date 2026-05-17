document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks = document.querySelectorAll('a[data-view]');
    const views = document.querySelectorAll('.view');
    const pageTitle = document.getElementById('page-title');
    
    const radioGrid = document.getElementById('radio-grid');
    const tvGrid = document.getElementById('tv-grid');
    const favoritesGrid = document.getElementById('favorites-grid');
    const noFavorites = document.getElementById('no-favorites');
    
    // Player Audio
    const audioPlayer = document.getElementById('audio-player');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const playIcon = btnPlayPause.querySelector('i');
    const volumeSlider = document.getElementById('volume-slider');
    const playerCover = document.getElementById('player-cover');
    const playerTitle = document.getElementById('player-title');
    const playerSubtitle = document.getElementById('player-subtitle');
    
    const tvModal = document.getElementById('tv-modal');
    const closeTvModal = document.getElementById('close-tv-modal');
    const tvPlayer = document.getElementById('tv-player');
    const tvModalTitle = document.getElementById('tv-modal-title');
    const btnShowCartelera = document.getElementById('btn-show-cartelera');
    let hls = null;

    // Cartelera URL Mapping
    const carteleraMap = {
        '1-Cubavision': 'cubavision',
        '2-Canal Clave': 'clave',
        '3-Canal Educativo': 'educativo',
        '4-Canal educativo-2': 'educativo2',
        '5-Canal Habana': 'habana',
        '6-Cubavision internacional': 'cvi',
        '7-Multivision': 'multivision',
        '9-Telerebelde': 'telerebelde'
    };

    // --- State ---
    let favorites = JSON.parse(localStorage.getItem('frecuenciaFavorites')) || [];
    let currentAudioUrl = '';
    let isPlaying = false;

    // --- Navigation (SPA) ---
    function switchView(viewId, title) {
        views.forEach(view => view.classList.remove('active-view'));
        navLinks.forEach(link => link.classList.remove('active'));
        
        document.getElementById(`view-${viewId}`).classList.add('active-view');
        document.querySelector(`a[data-view="${viewId}"]`).classList.add('active');
        
        pageTitle.textContent = title;
        
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }

        if (viewId === 'favorites') {
            renderFavorites();
        }

        // Scroll the main content area to the top on section change
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            const title = link.textContent.trim();
            switchView(viewId, title);
        });
    });

    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // --- Render Grids ---
    function createCard(item) {
        const isFav = favorites.includes(item.id);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <button class="btn-fav ${isFav ? 'active' : ''}" data-id="${item.id}">
                <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
            </button>
            <div class="card-img-wrapper">
                <img src="${item.image}" alt="${item.name}" class="card-img" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%231a1d24%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%23555%22 font-size=%2230%22>📻</text></svg>'">
            </div>
            <h3 class="card-title">${item.name}</h3>
        `;

        // Play action
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-fav')) return; // ignore fav click
            if (item.type === 'radio') {
                playRadio(item);
            } else if (item.type === 'tv') {
                playTv(item);
            }
        });

        // Favorite action
        const btnFav = card.querySelector('.btn-fav');
        btnFav.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(item.id, btnFav);
        });

        return card;
    }

    function renderGrids() {
        if (!appData) return;
        
        radioGrid.innerHTML = '';
        appData.radios.forEach(radio => {
            radioGrid.appendChild(createCard(radio));
        });

        tvGrid.innerHTML = '';
        appData.tvs.forEach(tv => {
            tvGrid.appendChild(createCard(tv));
        });
    }

    function renderFavorites() {
        favoritesGrid.innerHTML = '';
        if (favorites.length === 0) {
            noFavorites.style.display = 'block';
        } else {
            noFavorites.style.display = 'none';
            
            const allItems = [...appData.radios, ...appData.tvs];
            const favItems = allItems.filter(item => favorites.includes(item.id));
            
            favItems.forEach(item => {
                favoritesGrid.appendChild(createCard(item));
            });
        }
    }

    // --- Favorites Logic ---
    function toggleFavorite(id, btnElement) {
        const index = favorites.indexOf(id);
        const icon = btnElement.querySelector('i');
        
        if (index > -1) {
            favorites.splice(index, 1);
            btnElement.classList.remove('active');
            icon.classList.remove('fa-solid');
            icon.classList.add('fa-regular');
        } else {
            favorites.push(id);
            btnElement.classList.add('active');
            icon.classList.remove('fa-regular');
            icon.classList.add('fa-solid');
        }
        
        localStorage.setItem('frecuenciaFavorites', JSON.stringify(favorites));
        
        // Refresh grids to sync hearts
        const allFavBtns = document.querySelectorAll(`.btn-fav[data-id="${id}"]`);
        allFavBtns.forEach(btn => {
            const i = btn.querySelector('i');
            if (favorites.includes(id)) {
                btn.classList.add('active');
                i.className = 'fa-solid fa-heart';
            } else {
                btn.classList.remove('active');
                i.className = 'fa-regular fa-heart';
            }
        });

        // If currently in favorites view, re-render
        if (document.getElementById('view-favorites').classList.contains('active-view')) {
            renderFavorites();
        }
    }

    // --- Audio Player Logic ---
    function playRadio(radio) {
        // Stop TV if playing
        stopTv();

        if (currentAudioUrl !== radio.url) {
            currentAudioUrl = radio.url;
            audioPlayer.src = radio.url;
            playerTitle.textContent = radio.name;
            playerSubtitle.textContent = 'En vivo';
            playerCover.src = radio.image;
        }
        
        audioPlayer.play().then(() => {
            isPlaying = true;
            updatePlayIcon();
        }).catch(err => {
            console.error('Error playing audio:', err);
            alert('No se pudo reproducir esta emisora. Puede estar fuera de servicio temporalmente.');
        });
    }

    function togglePlay() {
        if (!currentAudioUrl) return;

        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
        } else {
            audioPlayer.play();
            isPlaying = true;
        }
        updatePlayIcon();
    }

    function updatePlayIcon() {
        playIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }

    btnPlayPause.addEventListener('click', togglePlay);

    volumeSlider.addEventListener('input', (e) => {
        audioPlayer.volume = e.target.value;
    });

    audioPlayer.addEventListener('error', () => {
        isPlaying = false;
        updatePlayIcon();
        playerSubtitle.textContent = 'Error de conexión';
    });

    // --- Video (TV) Player Logic ---
    function playTv(tv) {
        // Stop radio if playing
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
            updatePlayIcon();
        }

        tvModalTitle.textContent = tv.name;
        
        // Cartelera Logic
        
        // Match the name (e.g. "1-Cubavision" or just "Cubavision" from the mapping)
        // Since appData uses "Cubavision" (without the "1-"), let's check by id or match the key.
        // Wait, appData.tvs[0].name is "Cubavision" because build_data removed the "1-".
        // Let's create a better mapping based on name directly.
        const nameLower = tv.name.toLowerCase();
        let carteleraSlug = null;
        
        if (nameLower.includes('cubavision internacional') || nameLower.includes('cvi')) carteleraSlug = 'cvi';
        else if (nameLower.includes('cubavision') || nameLower.includes('cubavisión')) carteleraSlug = 'cubavision';
        else if (nameLower.includes('clave')) carteleraSlug = 'clave';
        else if (nameLower.includes('educativo 2') || nameLower.includes('educativo-2')) carteleraSlug = 'educativo2';
        else if (nameLower.includes('educativo')) carteleraSlug = 'educativo';
        else if (nameLower.includes('habana')) carteleraSlug = 'habana';
        else if (nameLower.includes('multivision') || nameLower.includes('multivisión')) carteleraSlug = 'multivision';
        else if (nameLower.includes('rebelde')) carteleraSlug = 'telerebelde';

        if (carteleraSlug) {
            btnShowCartelera.style.display = 'block';
            btnShowCartelera.onclick = () => {
                window.open(`https://www.tvcubana.icrt.cu/cartelera-de-la-tv-cubana/${carteleraSlug}`, '_blank');
            };
        } else {
            btnShowCartelera.style.display = 'none';
        }

        tvModal.classList.add('show');
        enterFullscreen(tvPlayer);
        
        if (Hls.isSupported() && tv.url.includes('.m3u8')) {
            if (hls) hls.destroy();
            hls = new Hls();
            hls.loadSource(tv.url);
            hls.attachMedia(tvPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                tvPlayer.play();
            });
        } else if (tvPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // For Safari
            tvPlayer.src = tv.url;
            tvPlayer.addEventListener('loadedmetadata', function() {
                tvPlayer.play();
            });
        } else {
            // Standard MP4 or fallback
            tvPlayer.src = tv.url;
            tvPlayer.play();
        }
    }

    function enterFullscreen(element) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.webkitEnterFullscreen) {
            element.webkitEnterFullscreen(); // iOS Safari
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    if (tvPlayer) {
        tvPlayer.addEventListener('webkitbeginfullscreen', () => {
            // Ensure modal state reflects fullscreen status on iOS
            if (!tvModal.classList.contains('show')) {
                tvModal.classList.add('show');
            }
        });
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    function stopTv() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        tvPlayer.pause();
        tvPlayer.src = '';
        exitFullscreen();
    }

    // Automatically enter fullscreen on rotating to landscape while TV modal is active
    function handleOrientationChange() {
        if (tvModal.classList.contains('show')) {
            const isLandscape = window.screen.orientation ? 
                                window.screen.orientation.type.startsWith('landscape') : 
                                (window.innerHeight < window.innerWidth);
            
            if (isLandscape) {
                enterFullscreen(tvPlayer);
            }
        }
    }

    if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', handleOrientationChange);
    } else {
        window.addEventListener('orientationchange', handleOrientationChange);
    }

    closeTvModal.addEventListener('click', () => {
        tvModal.classList.remove('show');
        stopTv();
    });

    // Close modal on outside click
    tvModal.addEventListener('click', (e) => {
        if (e.target === tvModal) {
            tvModal.classList.remove('show');
            stopTv();
        }
    });

    // Initialize
    renderGrids();
});
