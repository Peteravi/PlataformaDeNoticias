# news_service.py
import requests
from datetime import datetime, timedelta
import json

class NewsService:
    def __init__(self):
        self.api_key = "3a47611c276142ed9a5f87ecc8741b37"
        self.base_url = "https://newsapi.org/v2/everything"
        self.cache = {}
        self.cache_duration = timedelta(minutes=10)  # Cache por 10 minutos

    def get_news(self, query="ecuador", method="requests", page=1, category=None):
        cache_key = f"{query}_{page}_{category}"
        
        # Verificar caché
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            if datetime.now() - timestamp < self.cache_duration:
                return cached_data
        
        params = {
            "q": self._build_query(query, category),
            "pageSize": 10,
            "page": page,
            "apiKey": self.api_key,
            "language": "es",
            "sortBy": "publishedAt"
        }

        try:
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Procesar y estandarizar los datos
            articles = data.get("articles", [])
            processed_articles = [self._process_article(article) for article in articles]
            
            # Almacenar en caché
            self.cache[cache_key] = (processed_articles, datetime.now())
            
            return processed_articles
        except requests.exceptions.RequestException as e:
            print(f"Error al obtener noticias: {e}")
            return []

    def _build_query(self, query, category):
        base_query = query if query != "ecuador" else ""
        
        if category:
            if category == "politics":
                return f"{base_query} política OR gobierno OR asamblea".strip()
            elif category == "economy":
                return f"{base_query} economía OR dólar OR empleo".strip()
            elif category == "sports":
                return f"{base_query} deportes OR fútbol OR ecuatoriano".strip()
            elif category == "culture":
                return f"{base_query} cultura OR arte OR música".strip()
        
        return base_query if base_query else "ecuador"

    def _process_article(self, article):
        # Estandarizar el formato de los artículos
        return {
            "title": article.get("title", "Sin título"),
            "description": article.get("description", "Sin descripción"),
            "url": article.get("url", "#"),
            "image_url": article.get("urlToImage") or "https://via.placeholder.com/600x400?text=Sin+Imagen",
            "published_at": self._format_date(article.get("publishedAt")),
            "source": {"name": article.get("source", {}).get("name", "Fuente desconocida")}
        }

    def _format_date(self, date_str):
        if not date_str:
            return "Fecha desconocida"
        try:
            date = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
            return date.strftime("%d/%m/%Y %H:%M")
        except ValueError:
            return date_str

    def get_formatted_news(self, query="ecuador", page=1, category=None):
        return self.get_news(query=query, page=page, category=category)