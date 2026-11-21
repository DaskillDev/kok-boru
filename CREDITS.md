# Авторы и лицензии

## 3D-модели

| Файл | Что это | Автор / источник | Лицензия |
| --- | --- | --- | --- |
| `public/models/horse_rigged.glb` | Конь со скелетом, седлом и 28 анимациями (в игре: стойка, шаг, галоп, галоп в повороте) | «Horse» — **Henry S** (@henry_7 / henrysteve973), https://sketchfab.com/3d-models/horse-a6f860e43e364619bccb174a1ac7d0c9 | CC-BY 4.0 — указание автора обязательно |
| `public/models/typing-japanese-man.glb` | Всадник: скан человека со скелетом Mixamo (рубашка перекрашивается кодом в цвет команды) | «Typing-japanese-man» — **ddd** (@endonoriko), https://sketchfab.com/3d-models/typing-japanese-man-35578261554f48b9aab0888f7a28802e | CC-BY 4.0 — указание автора обязательно |

Изменения относительно оригиналов: масштаб, перекраска текстур (масти коней, форма команд), поза всадника.

## Текстуры и небо (Poly Haven, CC0)

| Файл | Что это | Источник | Лицензия |
| --- | --- | --- | --- |
| `public/textures/sky_2k.hdr` | HDRI-небо «Kloofendal 48d Partly Cloudy (Pure Sky)» | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 |
| `public/textures/grass_diff.jpg`, `grass_nor.jpg`, `grass_rough.jpg` | PBR-текстура травы «Sparse Grass» (цвет перекрашивается кодом) | https://polyhaven.com/a/sparse_grass | CC0 |

Всё остальное — калпак, попона, улак, казаны, юрты, горы, трава,
текстуры и орнаменты — сгенерировано кодом этого проекта (процедурная геометрия и canvas-текстуры).

## Библиотеки

- [three.js](https://threejs.org/) — MIT
- [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — физический движок, Apache-2.0
- [Vite](https://vite.dev/) — MIT
