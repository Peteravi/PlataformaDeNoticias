from flask import Flask, render_template, request, jsonify, redirect, url_for
from services.news_service import NewsService
import os
from functools import wraps
from datetime import datetime
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['PER_PAGE'] = 12  # Aumentamos a 12 noticias por página para mejor UX
app.config['CACHE_TIMEOUT'] = 300  # 5 minutos de caché

# Middleware para medir tiempos de respuesta
@app.before_request
def before_request():
    request.start_time = time.time()

@app.after_request
def after_request(response):
    duration = time.time() - request.start_time
    response.headers['X-Response-Time'] = f"{duration:.2f}s"
    return response

# Decorador para manejo de errores y caché
def cached_route(timeout=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            cache_key = f"{f.__name__}_{str(kwargs)}_{request.args}"
            cached_response = app.cache.get(cache_key) if hasattr(app, 'cache') else None
            
            if cached_response and (datetime.now() - cached_response['timestamp']).seconds < (timeout or app.config['CACHE_TIMEOUT']):
                return cached_response['response']
            
            try:
                response = f(*args, **kwargs)
                if hasattr(app, 'cache'):
                    app.cache[cache_key] = {
                        'response': response,
                        'timestamp': datetime.now()
                    }
                return response
            except Exception as e:
                app.logger.error(f"Error in {f.__name__}: {str(e)}")
                return render_template('error.html', error="Ocurrió un error al cargar las noticias"), 500
        return wrapper
    return decorator

@app.route('/')
@cached_route(60)  # 1 minuto de caché para la página principal
def root_redirect():
    category = request.args.get('category', 'all')
    q = request.args.get('q')
    
    params = {'page': 1}
    if category != 'all':
        params['category'] = category
    if q:
        params['q'] = q
        
    return redirect(url_for('home', **params))

@app.route('/pagina/<int:page>')
@cached_route()
def home(page):
    category = request.args.get('category', 'all')
    q = request.args.get('q')
    news_service = NewsService()

    # Optimización: Si es página 1 y no hay filtros, usamos la versión caché
    if page == 1 and category == 'all' and not q:
        return cached_route(120)(_render_home)(page, category, q, news_service)
    return _render_home(page, category, q, news_service)

def _render_home(page, category, q, news_service):
    news = news_service.get_formatted_news(
        query=q if q else None,
        page=page,
        category=category if category != 'all' else None
    )
    
    title_map = {
        'all': 'Últimas Noticias de Ecuador',
        'politics': 'Noticias de Política',
        'economy': 'Noticias Económicas',
        'sports': 'Noticias Deportivas',
        'culture': 'Noticias Culturales'
    }
    
    title = title_map.get(category, 'Últimas Noticias')
    if q:
        title = f"Resultados para: {q}"

    return render_template('index.html',
        articles=news,
        current_page=page,
        total_pages=5,
        current_category=category if category != 'all' else None,
        search_query=q,
        title=title,
        # Variables para optimización
        lazy_load=page > 1,  # Para lazy load en páginas > 1
        preload_images=page == 1  # Precargar imágenes solo en primera página
    )

@app.route('/api/news')
def api_news():
    # Headers para cache del cliente
    headers = {
        'Cache-Control': 'public, max-age=60',
        'Vary': 'X-Requested-With'
    }
    
    query = request.args.get('q', 'ecuador')
    method = request.args.get('method', 'requests')
    page = request.args.get('page', 1, type=int)
    category = request.args.get('category')

    news_service = NewsService()
    news = news_service.get_news(
        query=query,
        method=method,
        page=page,
        category=category
    )

    return jsonify(news), 200, headers

# Inicialización de caché en memoria (para producción usar Redis/Memcached)
app.cache = {}

if __name__ == '__main__':
    app.run(debug=True, threaded=True)