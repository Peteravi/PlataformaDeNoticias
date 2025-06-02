document.addEventListener('DOMContentLoaded', function() {
    // Cargar primero lo crítico para el usuario
    updateTimestamp();
    setupSearch();
    
    // Cargar el resto de forma asíncrona
    setTimeout(() => {
        setupCategoryFilters();
        setupInfiniteScroll();
        setupRefreshButton();
        setupAPIToggle();
        
        // Precargar imágenes si es la primera página
        if (document.body.dataset.preloadImages === 'true') {
            preloadImportantImages();
        }
    }, 100);
});

// Función optimizada para precargar imágenes
function preloadImportantImages() {
    const images = document.querySelectorAll('.news-card img[loading="lazy"]');
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src || img.src;
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '200px 0px' // Carga antes de que sean visibles
    });

    images.forEach(img => {
        if (img.complete || img.naturalWidth !== 0) {
            return; // Ya cargada
        }
        if ('loading' in HTMLImageElement.prototype && img.loading === 'lazy') {
            observer.observe(img);
        } else {
            img.src = img.dataset.src || img.src;
        }
    });
}

// Throttle mejorado para eventos
function throttle(fn, wait) {
    let lastCall = 0;
    let timeout;
    return function(...args) {
        const now = Date.now();
        const remaining = wait - (now - lastCall);
        
        clearTimeout(timeout);
        
        if (remaining <= 0) {
            lastCall = now;
            fn.apply(this, args);
        } else {
            timeout = setTimeout(() => {
                lastCall = Date.now();
                fn.apply(this, args);
            }, remaining);
        }
    };
}

function updateTimestamp() {
    const now = new Date();
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    document.getElementById('update-time').textContent = now.toLocaleString('es-ES', options);
}

function setupSearch() {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');

    if (searchBtn && searchInput) {
        // Debounce para la búsqueda
        const performSearch = debounce(() => {
            const query = searchInput.value.trim();
            if (query) {
                window.location.href = `/pagina/1?q=${encodeURIComponent(query)}`;
            } else {
                window.location.href = '/';
            }
        }, 300);

        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('input', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }
}

function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

function setupCategoryFilters() {
    const filterBtns = document.querySelectorAll('.category-filter');
    if (filterBtns.length > 0) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const category = this.dataset.category;
                // Transición suave antes de redirigir
                document.getElementById('news-grid').style.opacity = '0.5';
                setTimeout(() => {
                    if (category === 'all') {
                        window.location.href = '/pagina/1';
                    } else {
                        window.location.href = `/pagina/1?category=${category}`;
                    }
                }, 200);
            });
        });
    }
}

function setupRefreshButton() {
    const refreshBtn = document.getElementById('refresh-news');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            showLoader();
            // Limpiar caché antes de recargar
            if (window.caches) {
                caches.delete('news-cache').then(() => {
                    window.location.reload();
                });
            } else {
                window.location.reload();
            }
        });
    }
}

function setupAPIToggle() {
    const toggleBtn = document.getElementById('api-method-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            const currentMethod = this.dataset.method;
            const newMethod = currentMethod === 'requests' ? 'httpclient' : 'requests';
            this.dataset.method = newMethod;
            this.innerHTML = `<i class="fas fa-plug me-2"></i>Usando: ${newMethod}`;
            
            // Almacenar preferencia en localStorage
            localStorage.setItem('preferredApiMethod', newMethod);
            showAlert(`Método de API cambiado a ${newMethod}`, 'success');
        });
        
        // Cargar preferencia guardada
        const preferredMethod = localStorage.getItem('preferredApiMethod');
        if (preferredMethod) {
            toggleBtn.dataset.method = preferredMethod;
            toggleBtn.innerHTML = `<i class="fas fa-plug me-2"></i>Usando: ${preferredMethod}`;
        }
    }
}

function setupInfiniteScroll() {
    let isLoading = false;
    let page = parseInt(document.body.dataset.currentPage) || 1;
    const totalPages = parseInt(document.body.dataset.totalPages) || 5;
    let lastScrollPos = window.scrollY;

    const handleScroll = throttle(() => {
        if (isLoading || page >= totalPages) return;

        const scrollPos = window.scrollY;
        const scrollingDown = scrollPos > lastScrollPos;
        lastScrollPos = scrollPos;

        if (!scrollingDown) return;

        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.offsetHeight;
        const scrollBottom = scrollPos + windowHeight;
        
        // Cargar cuando estemos a 500px del final
        if (scrollBottom >= docHeight - 500) {
            loadMoreNews();
        }
    }, 200);

    window.addEventListener('scroll', handleScroll);

    async function loadMoreNews() {
        isLoading = true;
        showLoader();
        page++;

        const urlParams = new URLSearchParams(window.location.search);
        const category = urlParams.get('category') || 'all';
        const query = urlParams.get('q') || '';

        try {
            const apiUrl = buildApiUrl(page, category, query);
            const response = await fetchWithTimeout(apiUrl, {}, 5000);
            
            if (!response.ok) throw new Error('Error en la respuesta');
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                await appendNews(data);
                document.body.dataset.currentPage = page;
                showAlert(`Se cargaron ${data.length} noticias más`, 'success');
            } else {
                showAlert('No hay más noticias para cargar', 'info');
                page = totalPages;
                window.removeEventListener('scroll', handleScroll);
            }
        } catch (error) {
            console.error('Error:', error);
            showAlert('Error al cargar más noticias', 'danger');
            page--;
        } finally {
            isLoading = false;
            hideLoader();
        }
    }
}

function fetchWithTimeout(url, options = {}, timeout = 8000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
        )
    ]);
}

function buildApiUrl(page, category, query) {
    let apiUrl = `/api/news?page=${page}`;
    if (query) apiUrl += `&q=${encodeURIComponent(query)}`;
    if (category !== 'all') apiUrl += `&category=${encodeURIComponent(category)}`;
    
    // Usar el método preferido si está configurado
    const preferredMethod = localStorage.getItem('preferredApiMethod');
    if (preferredMethod) apiUrl += `&method=${preferredMethod}`;
    
    return apiUrl;
}

async function appendNews(articles) {
    const newsGrid = document.getElementById('news-grid');
    if (!newsGrid) return;

    // Fragmento de documento para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    await Promise.all(articles.map(async (article) => {
        const col = document.createElement('div');
        col.className = 'col animate__animated animate__fadeIn';
        
        const cardHtml = `
            <div class="card h-100 news-card">
                <div class="image-container" style="height: 200px; overflow: hidden;">
                    <img src="${article.image_url || 'https://via.placeholder.com/600x400?text=Sin+Imagen'}" 
                         class="card-img-top h-100 w-100 object-fit-cover" 
                         alt="${article.title}" 
                         loading="lazy">
                </div>
                <div class="card-body">
                    <span class="badge bg-secondary mb-2">${article.source.name}</span>
                    <h5 class="card-title">${article.title}</h5>
                    <p class="card-text text-truncate-3">${article.description || 'Sin descripción disponible'}</p>
                </div>
                <div class="card-footer bg-transparent">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">${article.published_at}</small>
                        <a href="${article.url}" target="_blank" class="btn btn-sm btn-outline-primary stretched-link">
                            Leer más <i class="fas fa-arrow-right ms-1"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;
        
        col.innerHTML = cardHtml;
        fragment.appendChild(col);
        
        // Precargar imagen en segundo plano
        if (article.image_url) {
            const img = new Image();
            img.src = article.image_url;
        }
    }));
    
    newsGrid.appendChild(fragment);
}

function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('d-none');
        loader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('d-none');
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '1060';
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.body.appendChild(alertDiv);
    
    // Auto-eliminación después de 3 segundos
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
    }, 3000);
}

// Service Worker para caché offline
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registrado con éxito:', registration.scope);
        }).catch(err => {
            console.log('Error al registrar ServiceWorker:', err);
        });
    });
}