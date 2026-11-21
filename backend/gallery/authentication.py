from rest_framework.authentication import SessionAuthentication


class CsrfSessionAuthentication(SessionAuthentication):
    """Session-auth, но с заголовком WWW-Authenticate —
    DRF тогда отдаёт 401 (а не 403) для не-вошедших.
    Фронтенд ловит 401 и уводит на страницу входа."""

    def authenticate_header(self, request):
        return 'Session'
