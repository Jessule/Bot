# Ball Race

- `ball-race.html`: el juego. Ábrelo en el navegador.
- `rec.js`: graba una carrera nueva en vídeo vertical 1080×1920 a 30 fps.

Para grabar hace falta Node con Playwright y ffmpeg:

```
node TikTok/plantillas/rec.js "$PWD/TikTok/plantillas/ball-race.html" TikTok/videos/carrera-nueva.mp4
```

Cada grabación es una carrera distinta.
