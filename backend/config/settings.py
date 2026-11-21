import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent      # backend/
ROOT_DIR = BASE_DIR.parent                             # корень проекта (Z5/)

# ---------- .env ----------
_env_file = ROOT_DIR / '.env'
if _env_file.exists():
    for _line in _env_file.read_text(encoding='utf-8').splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or 'dev-' + secrets.token_hex(32)
SITE_PASSWORD = os.environ.get('SITE_PASSWORD', '')

DEBUG = True
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'gallery',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django.middleware.gzip.GZipMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

# медиа: старая папка Node-версии — файлы продолжают работать
MEDIA_URL = '/uploads/'
MEDIA_ROOT = str(ROOT_DIR / 'uploads')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# большие видео (как было в Node-версии: 500 МБ)
FILE_UPLOAD_MAX_MEMORY_SIZE = 600 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 600 * 1024 * 1024

SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 дней

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'gallery.authentication.CsrfSessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'EXCEPTION_HANDLER': 'gallery.exceptions.api_exception_handler',
}
