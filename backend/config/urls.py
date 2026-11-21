import mimetypes

from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path

from gallery import views


def public_file(request, path):
    """Стили/скрипты сайта — доступны всем (нужны для страницы входа)."""
    from django.conf import settings
    f = settings.ROOT_DIR / 'public' / path
    if not f.is_file() or f.suffix.lower() == '.html':
        raise Http404
    ctype = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
    return FileResponse(f.open('rb'), content_type=ctype)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('gallery.auth_urls')),
    path('api/', include('gallery.urls')),
    path('login/', views.auth_page),
    path('register/', views.auth_page),
    # статика публичной папки (css/js) — без входа
    re_path(r'^(?P<path>[^/]+\.[A-Za-z0-9]+)$', public_file),
    # файлы медиа — только для залогиненных
    re_path(r'^uploads/(?P<path>.*)$', views.uploads_view),
    # главная — только после входа (иначе редирект на /login/)
    path('', views.index_view),
]
