import json
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Category, Media
from .serializers import CategorySerializer, MediaSerializer

# ---------- допустимые типы файлов (как в Node-версии) ----------
ALLOWED_MIME = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
}
MIME_EXT = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm',
    'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
}


def _site_password_ok(value) -> bool:
    expected = (settings.SITE_PASSWORD or '').encode()
    given = (value or '').encode()
    if not expected or not given:
        return False
    import hmac
    return hmac.compare_digest(expected, given)


# ==================================================================
#  AUTH — вход/регистрация невозможны без кода сайта из .env
# ==================================================================
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    site_password = request.data.get('site_password') or ''

    if not username or not password or not site_password:
        return Response({'error': 'Заполни все поля'}, status=400)
    if len(username) < 2:
        return Response({'error': 'Ник минимум 2 символа'}, status=400)
    if len(password) < 4:
        return Response({'error': 'Пароль минимум 4 символа'}, status=400)
    if not _site_password_ok(site_password):
        return Response({'error': 'Неверный код сайта'}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Такой ник уже занят'}, status=400)

    user = User.objects.create_user(username=username, password=password)
    login(request, user)
    return Response({'username': user.username}, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    site_password = request.data.get('site_password') or ''

    if not username or not password or not site_password:
        return Response({'error': 'Заполни все поля'}, status=400)
    if not _site_password_ok(site_password):
        return Response({'error': 'Неверный код сайта'}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Неверный ник или пароль'}, status=400)

    login(request, user)
    return Response({'username': user.username})


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return Response({'ok': True})


@api_view(['GET'])
@ensure_csrf_cookie
def me(request):
    if request.user and request.user.is_authenticated:
        return Response({'username': request.user.username})
    return Response({'error': 'Требуется вход'}, status=401)


# ==================================================================
#  КАТЕГОРИИ
# ==================================================================
@api_view(['GET', 'POST'])
def categories(request):
    if request.method == 'POST':
        return _category_create(request)
    qs = Category.objects.annotate(count=Count('media'))
    return Response(CategorySerializer(qs, many=True).data)


def _category_create(request):
    name = (request.data.get('name') or '').strip()
    if not name:
        return Response({'error': 'Имя категории обязательно'}, status=400)
    emoji = (request.data.get('emoji') or '🏷️')[:8]
    color = request.data.get('color') or '#f97316'
    import re
    if not re.match(r'^#[0-9a-fA-F]{6}$', color):
        color = '#f97316'
    cat = Category.objects.create(name=name[:40], emoji=emoji, color=color)
    return Response(CategorySerializer(cat).data, status=201)


@api_view(['PATCH'])
def category_update(request, pk):
    try:
        cat = Category.objects.get(pk=pk)
    except Category.DoesNotExist:
        return Response({'error': 'Не найдено'}, status=404)
    name = request.data.get('name')
    emoji = request.data.get('emoji')
    color = request.data.get('color')
    if name:
        cat.name = str(name).strip()[:40] or cat.name
    if emoji:
        cat.emoji = str(emoji)[:8]
    if color:
        import re
        if re.match(r'^#[0-9a-fA-F]{6}$', str(color)):
            cat.color = str(color)
    cat.save()
    return Response(CategorySerializer(cat).data)


@api_view(['DELETE'])
def category_delete(request, pk):
    try:
        cat = Category.objects.get(pk=pk)
    except Category.DoesNotExist:
        return Response({'error': 'Не найдено'}, status=404)
    cat.delete()  # M2M-связи с медиа удаляются автоматически
    return Response({'ok': True})


# ==================================================================
#  МЕДИА
# ==================================================================
@api_view(['GET', 'POST'])
def media(request):
    if request.method == 'POST':
        return _media_upload(request)
    qs = Media.objects.all()
    category = request.query_params.get('category')
    kind = request.query_params.get('type')
    q = request.query_params.get('q')
    if category:
        qs = qs.filter(categories__id=category)
    if kind in ('photo', 'video'):
        qs = qs.filter(kind=kind)
    if q:
        qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
    qs = qs.distinct()
    return Response(MediaSerializer(qs, many=True).data)


def _media_upload(request):
    files = request.FILES.getlist('files')
    if not files:
        return Response({'error': 'Файлы не загружены'}, status=400)
    if len(files) > 30:
        return Response({'error': 'Максимум 30 файлов за раз'}, status=400)

    bad = [f.name for f in files if (f.content_type or '') not in ALLOWED_MIME]
    if bad:
        return Response({'error': 'Неподдерживаемый файл: ' + bad[0]}, status=400)

    title = (request.data.get('title') or '').strip()[:120]
    description = (request.data.get('description') or '').strip()[:4000]
    try:
        cat_ids = json.loads(request.data.get('categories') or '[]')
    except (ValueError, TypeError):
        cat_ids = []
    if not isinstance(cat_ids, list):
        cat_ids = []
    valid_ids = set(Category.objects.values_list('id', flat=True))
    cat_ids = [c for c in cat_ids if c in valid_ids]

    created = []
    for f in files:
        mime = f.content_type or ''
        kind = 'video' if mime.startswith('video') else 'photo'
        orig_name = f.name                       # оригинальное имя пользователя
        ext = Path(orig_name).suffix.lower() or MIME_EXT.get(mime, '.bin')
        orig_stem = Path(orig_name).stem or 'media'
        f.name = secrets.token_hex(12) + ext     # имя на диске (как в Node-версии)
        item = Media(
            kind=kind,
            file=f,
            name=orig_name,
            size=f.size,
            mime=mime,
            title=title or orig_stem[:120],
            description=description,
        )
        item.save()
        if cat_ids:
            item.categories.set(cat_ids)
        created.append(item)

    return Response(MediaSerializer(created, many=True).data, status=201)


@api_view(['PATCH'])
def media_update(request, pk):
    try:
        item = Media.objects.get(pk=pk)
    except Media.DoesNotExist:
        return Response({'error': 'Не найдено'}, status=404)

    if 'title' in request.data and request.data['title'] is not None:
        item.title = str(request.data['title']).strip()[:120]
    if 'description' in request.data and request.data['description'] is not None:
        item.description = str(request.data['description']).strip()[:4000]
    if 'categories' in request.data:
        cat_ids = request.data['categories']
        if not isinstance(cat_ids, list):
            cat_ids = []
        valid_ids = set(Category.objects.values_list('id', flat=True))
        item.categories.set([c for c in cat_ids if c in valid_ids])
    item.save()
    item = Media.objects.get(pk=pk)
    return Response(MediaSerializer(item).data)


@api_view(['DELETE'])
def media_delete(request, pk):
    try:
        item = Media.objects.get(pk=pk)
    except Media.DoesNotExist:
        return Response({'error': 'Не найдено'}, status=404)
    if item.file:
        item.file.delete(save=False)
    item.delete()
    return Response({'ok': True})


# ==================================================================
#  СТРАНИЦЫ САЙТА (просмотр только после входа)
# ==================================================================
@ensure_csrf_cookie
def index_view(request):
    if not (request.user and request.user.is_authenticated):
        from django.shortcuts import redirect
        return redirect('/login/')
    html = settings.ROOT_DIR / 'public' / 'index.html'
    return FileResponse(html.open('rb'), content_type='text/html; charset=utf-8')


@ensure_csrf_cookie
def auth_page(request):
    """Страница входа/регистрации — доступна всем."""
    html = settings.ROOT_DIR / 'public' / 'login.html'
    return FileResponse(html.open('rb'), content_type='text/html; charset=utf-8')


def uploads_view(request, path):
    """Файлы медиа — только для залогиненных."""
    if not (request.user and request.user.is_authenticated):
        return JsonResponse({'error': 'Требуется вход'}, status=401)
    from django.views.static import serve as static_serve
    try:
        return static_serve(request, path, document_root=settings.MEDIA_ROOT)
    except Http404:
        raise
