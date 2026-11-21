from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Делает пользователя админом сайта (может удалять посты и категории). --remove — забрать права.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--remove', action='store_true', help='снять права админа')

    def handle(self, *args, **opts):
        try:
            user = User.objects.get(username=opts['username'])
        except User.DoesNotExist:
            raise CommandError(f'Пользователь «{opts["username"]}» не найден — сначала он должен зарегистрироваться.')
        on = not opts['remove']
        user.is_staff = on
        user.is_superuser = on
        user.save(update_fields=['is_staff', 'is_superuser'])
        self.stdout.write(self.style.SUCCESS(
            f'«{user.username}» теперь {"админ" if on else "обычный пользователь"}.'))
