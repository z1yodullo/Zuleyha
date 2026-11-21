from rest_framework.permissions import BasePermission


def is_admin(user) -> bool:
    """Админ сайта — суперпользователь или сотрудник (is_staff) Django."""
    return bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))


class IsSiteAdmin(BasePermission):
    """Удалять посты и категории может только админ."""
    message = 'Удалять может только админ'

    def has_permission(self, request, view):
        return is_admin(request.user)
