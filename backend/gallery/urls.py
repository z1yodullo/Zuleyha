from django.urls import path

from . import views

urlpatterns = [
    path('categories', views.categories),
    path('categories/<str:pk>', views.category_update),
    path('categories/<str:pk>/delete', views.category_delete),
    path('media', views.media),
    path('media/<str:pk>', views.media_update),
    path('media/<str:pk>/delete', views.media_delete),
]
