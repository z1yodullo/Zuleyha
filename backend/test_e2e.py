# -*- coding: utf-8 -*-
"""E2E тесты EMBER (DRF-версия): гейтинг, auth, CRUD, кириллица."""
import sys
import uuid
from pathlib import Path

import requests

BASE = 'http://localhost:3000'
ROOT = Path(__file__).resolve().parent.parent


def _load_site_password():
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('SITE_PASSWORD='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise RuntimeError('SITE_PASSWORD не найден в .env')


SITE_PASSWORD = _load_site_password()

passed = failed = 0


def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  OK   {name}')
    else:
        failed += 1
        print(f'  FAIL {name} {extra}')


def main():
    s = requests.Session()

    # ---------- 1. ГЕЙТИНГ: без входа ничего не доступно ----------
    print('\n[1] Гейтинг без входа')
    r = s.get(BASE + '/', allow_redirects=False)
    check('GET / -> редирект на /login/', r.status_code == 302 and '/login/' in r.headers.get('Location', ''), f'{r.status_code}')
    r = s.get(BASE + '/login/')
    check('GET /login/ -> 200', r.status_code == 200)
    r = s.get(BASE + '/register/')
    check('GET /register/ -> 200', r.status_code == 200)
    r = s.get(BASE + '/api/media')
    check('GET /api/media -> 401', r.status_code == 401, f'{r.status_code}')
    check('401 содержит error', 'error' in r.json())
    r = s.get(BASE + '/api/categories')
    check('GET /api/categories -> 401', r.status_code == 401, f'{r.status_code}')
    r = s.get(BASE + '/style.css')
    check('CSS доступен без входа', r.status_code == 200)
    r = s.get(BASE + '/app.js')
    check('JS доступен без входа', r.status_code == 200)
    r = s.get(BASE + '/uploads/' + _some_upload())
    check('файл медиа -> 401 без входа', r.status_code == 401, f'{r.status_code}')

    # ---------- 2. РЕГИСТРАЦИЯ ----------
    print('\n[2] Регистрация')
    nick = 'tester_' + uuid.uuid4().hex[:6]
    r = s.post(BASE + '/api/auth/register', json={
        'username': nick, 'password': 'pass1234', 'site_password': 'WRONG-CODE'})
    check('неверный код сайта -> 400', r.status_code == 400, f'{r.status_code}')
    check('сообщение про код сайта', 'код' in r.json().get('error', '').lower())

    r = s.post(BASE + '/api/auth/register', json={
        'username': nick, 'password': '12', 'site_password': SITE_PASSWORD})
    check('короткий пароль -> 400', r.status_code == 400)

    r = s.post(BASE + '/api/auth/register', json={
        'username': nick, 'password': 'pass1234', 'site_password': SITE_PASSWORD})
    check('регистрация с кодом сайта -> 201', r.status_code == 201, f'{r.status_code} {r.text[:120]}')

    csrf0 = s.cookies.get('csrftoken') or ''
    r = s.post(BASE + '/api/auth/register', json={
        'username': nick, 'password': 'pass1234', 'site_password': SITE_PASSWORD},
        headers={'X-CSRFToken': csrf0})
    check('дубль ника -> 400', r.status_code == 400, f'{r.status_code}')

    # ---------- 3. ВХОД ----------
    print('\n[3] Вход')
    s2 = requests.Session()
    r = s2.post(BASE + '/api/auth/login', json={
        'username': nick, 'password': 'pass1234', 'site_password': 'WRONG'})
    check('вход с неверным кодом сайта -> 400', r.status_code == 400)
    r = s2.post(BASE + '/api/auth/login', json={
        'username': nick, 'password': 'BADPASS', 'site_password': SITE_PASSWORD})
    check('вход с неверным паролем -> 400', r.status_code == 400)
    r = s2.post(BASE + '/api/auth/login', json={
        'username': nick, 'password': 'pass1234', 'site_password': SITE_PASSWORD})
    check('вход с двумя паролями -> 200', r.status_code == 200, f'{r.status_code} {r.text[:120]}')

    # ---------- 4. ПОСЛЕ ВХОДА ----------
    print('\n[4] Доступ после входа')
    r = s.get(BASE + '/')
    check('GET / -> 200 (index.html)', r.status_code == 200 and 'EMBER' in r.text)
    r = s.get(BASE + '/api/media')
    check('GET /api/media -> 200', r.status_code == 200)
    media = r.json()
    media0 = len(media)
    check('демо-медиа на месте', media0 >= 12, f'{media0}')
    m0 = media[0]
    for key in ['id', 'kind', 'url', 'name', 'size', 'mime', 'title', 'description', 'categories', 'createdAt']:
        check(f'поле {key} есть', key in m0)
    check('createdAt — число (ms)', isinstance(m0['createdAt'], (int, float)) and m0['createdAt'] > 10**12)
    r = s.get(BASE + '/api/categories')
    check('GET /api/categories -> 200', r.status_code == 200)
    cats = r.json()
    cats0 = len(cats)
    check('демо-категории на месте', cats0 >= 6, f'{cats0}')
    check('у категории count', all('count' in c for c in cats))
    r = s.get(BASE + m0['url'])
    check('файл медиа доступен после входа', r.status_code == 200)

    # ---------- 5. CSRF ----------
    print('\n[5] CSRF-защита')
    csrf = s.cookies.get('csrftoken')
    check('csrftoken cookie выдан', bool(csrf))
    r = s.post(BASE + '/api/categories', json={'name': 'Без CSRF'})
    check('POST без CSRF-токена -> 403', r.status_code == 403, f'{r.status_code}')
    r = s.post(BASE + '/api/categories', json={'name': 'С CSRF'},
               headers={'X-CSRFToken': csrf or ''})
    check('POST с CSRF-токеном -> 201', r.status_code == 201, f'{r.status_code} {r.text[:120]}')
    new_cat = r.json()
    check('кириллица в названии категории', new_cat['name'] == 'С CSRF', new_cat['name'])

    # ---------- 6. CRUD ----------
    print('\n[6] CRUD категорий и медиа')
    csrf = s.cookies.get('csrftoken')
    H = {'X-CSRFToken': csrf}

    r = s.patch(BASE + '/api/categories/' + new_cat['id'],
                json={'name': 'Обновлено', 'emoji': '⚡', 'color': '#123456'}, headers=H)
    check('PATCH категории', r.status_code == 200 and r.json()['name'] == 'Обновлено')

    # загрузка файла с кириллицей
    png = bytes.fromhex(
        '89504e470d0a1a0a0000000d494844520000000100000001080600000'
        '01f15c4890000000d49444154789c626001000000ffff030000060005'
        '57bfabd40000000049454e44ae426082')
    files = [('files', ('пикча тест.png', png, 'image/png'))]
    data = {
        'title': 'Загрузка с кириллицей',
        'description': 'Проверка описания 🌟',
        'categories': f'["{new_cat["id"]}"]',
    }
    r = s.post(BASE + '/api/media', files=files, data=data, headers=H)
    check('загрузка -> 201', r.status_code == 201, f'{r.status_code} {r.text[:160]}')
    created = r.json()[0]
    check('название с кириллицей', created['title'] == 'Загрузка с кириллицей', created['title'])
    check('mime определён', created['mime'] == 'image/png')
    check('kind=photo', created['kind'] == 'photo')
    check('категория привязана', new_cat['id'] in created['categories'])

    r = s.patch(BASE + '/api/media/' + created['id'],
                json={'description': 'Новое описание', 'categories': []}, headers=H)
    check('PATCH описания', r.status_code == 200 and r.json()['description'] == 'Новое описание')
    check('категории сняты', r.json()['categories'] == [])

    r = s.patch(BASE + '/api/media/' + created['id'],
                json={'categories': [new_cat['id']]}, headers=H)
    check('категория возвращена', r.json()['categories'] == [new_cat['id']])

    # фильтры и поиск
    r = s.get(BASE + '/api/media?category=' + new_cat['id'])
    check('фильтр по категории', len(r.json()) == 1, f'{len(r.json())}')
    r = s.get(BASE + '/api/media?type=photo')
    check('фильтр фото', all(m['kind'] == 'photo' for m in r.json()))
    r = s.get(BASE + '/api/media?type=video')
    check('фильтр видео', r.json() == [] or all(m['kind'] == 'video' for m in r.json()))
    r = s.get(BASE + '/api/media?q=' + requests.utils.quote('кириллицей'))
    check('поиск по кириллице', len(r.json()) == 1, f'{len(r.json())}')

    # пустой файл -> 400
    r = s.post(BASE + '/api/media', data={'title': 'пусто'}, headers=H)
    check('загрузка без файлов -> 400', r.status_code == 400)

    # удаление
    r = s.delete(BASE + '/api/media/' + created['id'] + '/delete', headers=H)
    check('DELETE медиа', r.status_code == 200)
    r = s.get(BASE + '/api/media')
    check('после удаления как в начале', len(r.json()) == media0, f'{len(r.json())} != {media0}')
    r = s.delete(BASE + '/api/categories/' + new_cat['id'] + '/delete', headers=H)
    check('DELETE категории', r.status_code == 200)
    r = s.get(BASE + '/api/categories')
    check('после удаления как в начале', len(r.json()) == cats0, f'{len(r.json())} != {cats0}')

    # ---------- 7. ВЫХОД ----------
    print('\n[7] Выход')
    r = s.post(BASE + '/api/auth/logout', headers=H)
    check('logout -> 200', r.status_code == 200)
    r = s.get(BASE + '/api/media')
    check('после выхода API -> 401', r.status_code == 401, f'{r.status_code}')
    r = s.get(BASE + '/', allow_redirects=False)
    check('после выхода / -> /login/', r.status_code == 302)

    # ---------- 8. АДМИНКА ----------
    print('\n[8] Админка')
    r = requests.get(BASE + '/admin/', allow_redirects=False)
    check('admin доступен (302 на логин)', r.status_code in (302, 200))

    print(f'\n=== ИТОГ: {passed} OK, {failed} FAIL ===')
    sys.exit(1 if failed else 0)


def _some_upload():
    uploads = list((ROOT / 'uploads').glob('*.png'))
    return uploads[0].name if uploads else 'none.png'


if __name__ == '__main__':
    main()
