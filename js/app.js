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

    // --- Network & Recovery State ---
    let shouldBePlaying = false; // Capture explicit user play/pause intent
    let isOffline = !navigator.onLine;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    let endlessRecoveryTimer = null;

    let lastCurrentTime = -1;
    let stagnantTimeCount = 0;
    let watchdogInterval = null;


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
        card.setAttribute('tabindex', '0');
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

        // TV Remote / Keyboard Enter Activation
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                card.click();
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

    // --- Toast Notification Helper ---
    function showToast(title, message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';
        if (type === 'danger') iconClass = 'fa-solid fa-circle-exclamation';

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
        `;
        
        container.appendChild(toast);
        
        // Force reflow
        toast.offsetHeight;
        
        // Show
        container.classList.add('show');
        
        const closeBtn = toast.querySelector('.toast-close');
        const dismissToast = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                toast.remove();
                if (container.children.length === 0) {
                    container.classList.remove('show');
                }
            }, 400);
        };
        
        closeBtn.addEventListener('click', dismissToast);
        
        if (duration > 0) {
            setTimeout(dismissToast, duration);
        }
    }

    // --- Audio Watchdog ---
    function startWatchdog() {
        stopWatchdog();
        lastCurrentTime = audioPlayer.currentTime;
        stagnantTimeCount = 0;
        
        watchdogInterval = setInterval(() => {
            if (!isPlaying || isOffline) {
                stagnantTimeCount = 0;
                return;
            }
            
            if (audioPlayer.currentTime === lastCurrentTime) {
                stagnantTimeCount++;
                if (stagnantTimeCount >= 3) { // 3 ticks * 3s = 9s stagnant
                    console.log('Watchdog: Audio stream stagnant. Reconnecting...');
                    reconnectStream();
                } else {
                    playerSubtitle.textContent = 'Cargando señal...';
                }
            } else {
                stagnantTimeCount = 0;
                playerSubtitle.textContent = 'En vivo';
                lastCurrentTime = audioPlayer.currentTime;
            }
        }, 3000);
    }

    function stopWatchdog() {
        if (watchdogInterval) {
            clearInterval(watchdogInterval);
            watchdogInterval = null;
        }
    }

    // --- Endless Recovery Loop (WebView Friendly) ---
    function startEndlessRecovery() {
        stopEndlessRecovery();
        
        console.log('Starting endless recovery loop...');
        playerSubtitle.textContent = 'Sin señal - Buscando...';
        
        endlessRecoveryTimer = setInterval(() => {
            if (!shouldBePlaying) {
                stopEndlessRecovery();
                return;
            }
            
            if (!isPlaying) {
                console.log('Endless Recovery Check: Trying to connect...');
                playerSubtitle.textContent = 'Buscando señal...';
                
                audioPlayer.pause();
                audioPlayer.src = '';
                audioPlayer.load();
                
                setTimeout(() => {
                    if (!shouldBePlaying) return;
                    
                    audioPlayer.src = currentAudioUrl;
                    audioPlayer.load();
                    
                    audioPlayer.play().then(() => {
                        console.log('Endless Recovery Check: Succeeded!');
                        isPlaying = true;
                        updatePlayIcon();
                        playerSubtitle.textContent = 'En vivo';
                        showToast(
                            'Señal restablecida', 
                            'La transmisión se ha reanudado automáticamente.', 
                            'success'
                        );
                        startWatchdog();
                        stopEndlessRecovery();
                    }).catch(err => {
                        console.log('Endless Recovery Check: Failed attempt. Will retry...');
                        playerSubtitle.textContent = 'Esperando señal...';
                    });
                }, 1000);
            } else {
                stopEndlessRecovery();
            }
        }, 8000); // Check every 8 seconds
    }

    function stopEndlessRecovery() {
        if (endlessRecoveryTimer) {
            clearInterval(endlessRecoveryTimer);
            endlessRecoveryTimer = null;
        }
    }

    // --- Reconnect Logic ---
    function reconnectStream() {
        if (!currentAudioUrl) return;
        
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        
        console.log('Attempting to reconnect...');
        playerSubtitle.textContent = 'Conectando emisora...';
        
        // Stop current audio player completely to free sockets
        audioPlayer.pause();
        audioPlayer.src = '';
        audioPlayer.load();
        
        // If we are offline, go straight to the endless recovery loop
        if (isOffline || !navigator.onLine) {
            startEndlessRecovery();
            return;
        }
        
        // Small timeout before resetting src and playing to let sockets close cleanly
        reconnectTimeout = setTimeout(() => {
            if (isOffline || !navigator.onLine) {
                startEndlessRecovery();
                return;
            }

            audioPlayer.src = currentAudioUrl;
            audioPlayer.load();
            
            audioPlayer.play().then(() => {
                isPlaying = true;
                updatePlayIcon();
                playerSubtitle.textContent = 'En vivo';
                startWatchdog();
                reconnectAttempts = 0;
                stopEndlessRecovery();
            }).catch(err => {
                console.error('Reconnect failed:', err);
                reconnectAttempts++;
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    playerSubtitle.textContent = `Reintentando reconexión (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
                    reconnectTimeout = setTimeout(reconnectStream, 3000);
                } else {
                    isPlaying = false;
                    updatePlayIcon();
                    playerSubtitle.textContent = 'Señal caída - Buscando...';
                    stopWatchdog();
                    startEndlessRecovery(); // Transition to slow recovery loop
                }
            });
        }, 1000);
    }

    // --- Network Listeners ---
    window.addEventListener('offline', () => {
        isOffline = true;
        
        // Cancel any pending background reconnect timeouts
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        showToast(
            'Sin conexión a Internet', 
            'Se ha perdido la conexión de red. La reproducción se reanudará automáticamente al recuperar la señal.', 
            'danger', 
            0
        );
        
        if (isPlaying) {
            audioPlayer.pause();
            playerSubtitle.textContent = 'Esperando conexión de red...';
            stopWatchdog();
        }
        
        if (shouldBePlaying) {
            startEndlessRecovery();
        }
    });

    window.addEventListener('online', () => {
        isOffline = false;
        
        // Dismiss offline danger toasts
        const offlineToasts = document.querySelectorAll('.toast.danger');
        offlineToasts.forEach(t => {
            const closeBtn = t.querySelector('.toast-close');
            if (closeBtn) closeBtn.click();
        });
        
        showToast(
            'Conexión restaurada', 
            'La señal de Internet ha vuelto. Restableciendo la transmisión...', 
            'success', 
            4000
        );
        
        if (shouldBePlaying && currentAudioUrl) {
            stopEndlessRecovery();
            reconnectAttempts = 0;
            reconnectStream();
        }
    });

    // --- Audio Player Logic ---
    function playRadio(radio) {
        // Stop TV if playing
        stopTv();
        
        shouldBePlaying = true; // Set explicit play intent
        stopEndlessRecovery();
        
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectAttempts = 0;

        if (currentAudioUrl !== radio.url) {
            currentAudioUrl = radio.url;
            audioPlayer.src = radio.url;
            playerTitle.textContent = radio.name;
            playerSubtitle.textContent = 'Conectando...';
            playerCover.src = radio.image;
        }
        
        playerSubtitle.textContent = 'Conectando...';
        
        audioPlayer.play().then(() => {
            isPlaying = true;
            updatePlayIcon();
            playerSubtitle.textContent = 'En vivo';
            startWatchdog();
        }).catch(err => {
            console.error('Error playing audio:', err);
            isPlaying = false;
            updatePlayIcon();
            playerSubtitle.textContent = 'Señal no disponible';
            showToast(
                'Emisora no disponible',
                'No se pudo conectar a la transmisión. La emisora puede estar inactiva temporariamente.',
                'warning'
            );
            stopWatchdog();
            startEndlessRecovery(); // Start seeking signal in the background
        });
    }

    function togglePlay() {
        if (!currentAudioUrl) return;

        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectAttempts = 0;

        if (isPlaying) {
            shouldBePlaying = false; // Set explicit pause intent
            stopEndlessRecovery();
            audioPlayer.pause();
            isPlaying = false;
            playerSubtitle.textContent = 'Pausado';
            stopWatchdog();
        } else {
            shouldBePlaying = true; // Set explicit play intent
            stopEndlessRecovery();
            playerSubtitle.textContent = 'Conectando...';
            // Force reload to get fresh live stream frames instead of lagging buffer
            audioPlayer.src = currentAudioUrl;
            audioPlayer.load();
            
            audioPlayer.play().then(() => {
                isPlaying = true;
                playerSubtitle.textContent = 'En vivo';
                startWatchdog();
            }).catch(err => {
                console.error('Error playing audio:', err);
                isPlaying = false;
                playerSubtitle.textContent = 'Señal no disponible';
                showToast(
                    'Emisora no disponible',
                    'No se pudo conectar a la transmisión. La emisora puede estar inactiva temporariamente.',
                    'warning'
                );
                stopWatchdog();
                startEndlessRecovery(); // Start seeking signal in the background
            });
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

    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio player error occurred:', e);
        stopWatchdog();
        
        if (shouldBePlaying && currentAudioUrl) {
            isPlaying = false;
            updatePlayIcon();
            playerSubtitle.textContent = 'Buscando señal...';
            startEndlessRecovery(); // Instantly enter background recovery loop
        } else {
            isPlaying = false;
            updatePlayIcon();
            playerSubtitle.textContent = 'Error de conexión';
            showToast(
                'Error de transmisión', 
                'Ocurrió un error al cargar la señal de la emisora. Puede estar temporalmente fuera de servicio.', 
                'danger'
            );
        }
    });

    // --- Video (TV) Player Logic ---
    function playTv(tv) {
        // Stop radio if playing
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
            updatePlayIcon();
        }
        shouldBePlaying = false; // Focus is now TV, turn off radio auto-reconnect intent
        stopEndlessRecovery();

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

    // --- Google TV / Android TV Remote Support (D-pad & Back Button) ---
    document.addEventListener('keydown', (e) => {
        // 1. Back/Escape Key to close TV modal
        if (e.key === 'Escape' || e.key === 'Backspace') {
            const tvModalEl = document.getElementById('tv-modal');
            if (tvModalEl && tvModalEl.classList.contains('show')) {
                e.preventDefault();
                const closeBtn = document.getElementById('close-tv-modal');
                if (closeBtn) closeBtn.click();
            }
            return;
        }

        // 2. D-pad Directional Navigation
        const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!arrowKeys.includes(e.key)) return;

        // Skip spatial navigation if focused on an input field
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

        const active = document.activeElement;
        
        // Target list of focusable elements currently visible in the active PWA view
        const focusableSelectors = 'a[data-view], .card, .btn-fav, .control-btn, #volume-slider, .close-modal, #btn-show-cartelera, #menu-toggle';
        
        const focusables = Array.from(document.querySelectorAll(focusableSelectors)).filter(el => {
            // Only select elements that are visible and have dimensions
            return el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none';
        });

        if (focusables.length === 0) return;

        // Focus first target if nothing is focused yet
        if (!active || !focusables.includes(active)) {
            const defaultTarget = document.querySelector('a[data-view].active') || focusables[0];
            defaultTarget.focus();
            e.preventDefault();
            return;
        }

        const activeRect = active.getBoundingClientRect();
        const activeCenter = {
            x: activeRect.left + activeRect.width / 2,
            y: activeRect.top + activeRect.height / 2
        };

        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(candidate => {
            if (candidate === active) return;

            const rect = candidate.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            const dx = center.x - activeCenter.x;
            const dy = center.y - activeCenter.y;

            let isDirectionMatch = false;

            // Simple directional threshold filtering (1.5 threshold helps prevent diagonal jumping)
            switch (e.key) {
                case 'ArrowLeft':
                    isDirectionMatch = dx < -5 && Math.abs(dy) < Math.abs(dx) * 1.5;
                    break;
                case 'ArrowRight':
                    isDirectionMatch = dx > 5 && Math.abs(dy) < Math.abs(dx) * 1.5;
                    break;
                case 'ArrowUp':
                    isDirectionMatch = dy < -5 && Math.abs(dx) < Math.abs(dy) * 1.5;
                    break;
                case 'ArrowDown':
                    isDirectionMatch = dy > 5 && Math.abs(dx) < Math.abs(dy) * 1.5;
                    break;
            }

            if (isDirectionMatch) {
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestCandidate = candidate;
                }
            }
        });

        if (bestCandidate) {
            bestCandidate.focus();
            e.preventDefault();
        }
    });

    // Initialize
    renderGrids();
});
