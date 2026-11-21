# Авторы и лицензии

## 3D-модели

| Файл | Что это | Автор / источник | Лицензия |
| --- | --- | --- | --- |
| `public/models/Horse.glb` | Лошадь с анимацией галопа (морф-таргеты) | Студия **Mirada**, проект «3 Dreams of Black» (ro.me); взято из примеров three.js: `examples/models/gltf/Horse.glb`, https://github.com/mrdoob/three.js | Распространяется в репозитории three.js (MIT). Отдельного файла лицензии у модели нет — **перед коммерческим релизом уточнить права или заменить** на CC0-модель (например, Quaternius). |

## Текстуры и небо (Poly Haven, CC0)

| Файл | Что это | Источник | Лицензия |
| --- | --- | --- | --- |
| `public/textures/sky_2k.hdr` | HDRI-небо «Kloofendal 48d Partly Cloudy (Pure Sky)» | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 |
| `public/textures/grass_diff.jpg`, `grass_nor.jpg`, `grass_rough.jpg` | PBR-текстура травы «Sparse Grass» (цвет перекрашивается кодом) | https://polyhaven.com/a/sparse_grass | CC0 |

Всё остальное — всадник (чапан, калпак), седло и попона, улак, казаны, юрты, горы, трава,
текстуры и орнаменты — сгенерировано кодом этого проекта (процедурная геометрия и canvas-текстуры).

## Библиотеки

- [three.js](https://threejs.org/) — MIT
- [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — физический движок, Apache-2.0
- [Vite](https://vite.dev/) — MIT
