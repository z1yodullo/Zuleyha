from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def _message(detail):
    """Превращает DRF-detail в одну читаемую строку."""
    if isinstance(detail, dict):
        for value in detail.values():
            return _message(value)
        return 'Ошибка данных'
    if isinstance(detail, (list, tuple)):
        return _message(detail[0]) if detail else 'Ошибка данных'
    return str(detail)


def api_exception_handler(exc, context):
    """Ответы вида {"error": "..."} — как ждёт фронтенд."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and 'error' in data:
        return response
    return Response({'error': _message(data)}, status=response.status_code)
