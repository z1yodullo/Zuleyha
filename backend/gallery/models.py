import secrets

from django.db import models


class Category(models.Model):
    id = models.CharField(max_length=40, primary_key=True)
    name = models.CharField('Название', max_length=40)
    emoji = models.CharField('Эмодзи', max_length=8, default='🏷️')
    color = models.CharField('Цвет', max_length=7, default='#f97316')
    position = models.PositiveIntegerField('Порядок', default=0)

    class Meta:
        ordering = ['position', 'id']
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'

    def save(self, *args, **kwargs):
        if not self.id:
            self.id = 'cat-' + secrets.token_hex(6)
            if not self.position:
                last = Category.objects.order_by('-position').values_list('position', flat=True).first()
                self.position = (last or 0) + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.emoji} {self.name}'


class Media(models.Model):
    KIND_CHOICES = [('photo', 'Фото'), ('video', 'Видео')]

    id = models.CharField(max_length=40, primary_key=True)
    kind = models.CharField('Тип', max_length=10, choices=KIND_CHOICES, default='photo')
    file = models.FileField('Файл', upload_to='')
    name = models.CharField('Имя файла', max_length=255)
    size = models.BigIntegerField('Размер', default=0)
    mime = models.CharField('MIME', max_length=100, default='')
    title = models.CharField('Название', max_length=120, blank=True, default='')
    description = models.TextField('Описание', max_length=4000, blank=True, default='')
    categories = models.ManyToManyField(
        Category, related_name='media', verbose_name='Категории', blank=True
    )
    created_at = models.DateTimeField('Создано', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Медиа'
        verbose_name_plural = 'Медиа'

    def save(self, *args, **kwargs):
        if not self.id:
            self.id = 'm-' + secrets.token_hex(8)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title or self.name
