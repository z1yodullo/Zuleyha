from django.contrib import admin

from .models import Category, Media


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('emoji', 'name', 'color', 'position', 'id')
    search_fields = ('name',)


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ('title', 'kind', 'name', 'created_at', 'id')
    list_filter = ('kind',)
    search_fields = ('title', 'description', 'name')
    filter_horizontal = ('categories',)
