import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from gallery.models import Category, Media


class Command(BaseCommand):
    help = 'Переносит данные из data/db.json (Node-версия) в SQLite'

    def handle(self, *args, **options):
        if Media.objects.exists() or Category.objects.exists():
            self.stdout.write('База уже не пуста — импорт пропущен.')
            return

        db_file = settings.ROOT_DIR / 'data' / 'db.json'
        if not db_file.exists():
            self.stdout.write('data/db.json не найден — база остаётся пустой.')
            return

        db = json.loads(db_file.read_text(encoding='utf-8'))

        for i, c in enumerate(db.get('categories', [])):
            Category.objects.create(
                id=c.get('id') or '',
                name=(c.get('name') or 'Категория')[:40],
                emoji=(c.get('emoji') or '🏷️')[:8],
                color=(c.get('color') or '#f97316')[:7],
                position=i + 1,
            )
        self.stdout.write(f'  категорий: {Category.objects.count()}')

        imported = skipped = 0
        for item in db.get('media', []):
            url = item.get('url', '')
            fname = Path(url).name
            fpath = Path(settings.MEDIA_ROOT) / fname
            if not fname or not fpath.exists():
                skipped += 1
                continue

            created_ms = item.get('createdAt') or 0
            created_at = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc)

            m = Media(
                id=item.get('id') or '',
                kind=item.get('kind') or 'photo',
                file=fname,
                name=item.get('name') or fname,
                size=item.get('size') or fpath.stat().st_size,
                mime=item.get('mime') or '',
                title=(item.get('title') or '')[:120],
                description=(item.get('description') or '')[:4000],
                created_at=created_at,
            )
            m.save()
            # auto_now_add перезаписал бы дату — восстанавливаем оригинальную
            Media.objects.filter(pk=m.pk).update(created_at=created_at)
            cat_ids = [c for c in (item.get('categories') or [])
                       if Category.objects.filter(pk=c).exists()]
            if cat_ids:
                m.categories.set(cat_ids)
            imported += 1

        self.stdout.write(self.style.SUCCESS(
            f'Импортировано медиа: {imported}, пропущено (нет файла): {skipped}'
        ))
