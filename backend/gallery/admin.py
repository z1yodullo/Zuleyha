from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from .models import Category, Media, UserCredential


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


class CredentialInline(admin.StackedInline):
    model = UserCredential
    extra = 0
    max_num = 1


class UserAdmin(DjangoUserAdmin):
    inlines = [CredentialInline]
    list_display = ('username', 'date_joined', 'is_active')


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(UserCredential)
class UserCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'password_plain', 'created_at')
    search_fields = ('user__username', 'password_plain')
    readonly_fields = ('user', 'password_plain', 'created_at')
