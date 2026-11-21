from rest_framework import serializers

from .models import Category, Media


class CategorySerializer(serializers.ModelSerializer):
    count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'emoji', 'color', 'count']
        read_only_fields = ['id', 'count']

    def get_count(self, obj):
        annotated = getattr(obj, 'count', None)
        if annotated is not None:
            return annotated
        return obj.media.count()


class MediaSerializer(serializers.ModelSerializer):
    categories = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Category.objects.all()
    )
    createdAt = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            'id', 'kind', 'url', 'name', 'size', 'mime',
            'title', 'description', 'categories', 'createdAt',
        ]
        read_only_fields = ['id', 'kind', 'url', 'name', 'size', 'mime', 'createdAt']

    def get_url(self, obj):
        return obj.file.url if obj.file else ''

    def get_createdAt(self, obj):
        # фронт делает new Date(createdAt) — ждёт миллисекунды
        return int(obj.created_at.timestamp() * 1000)
