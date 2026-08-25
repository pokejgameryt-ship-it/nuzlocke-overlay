# Generar ZIPs de sprites en Google Cloud

El problema: descargar 78K archivos individuales de Google Drive toma ~50 min porque cada archivo necesita 2 requests HTTP.

La solución: generar ZIPs directamente en los servidores de Google (sin descargar nada localmente), y luego descargar solo 10 ZIPs (~2 min).

## Pasos

1. Ve a https://script.google.com
2. Haz clic en "Nuevo proyecto"
3. Borra el código que haya y pega el contenido de `scripts/gdrive-zip-generator.gs`
4. Haz clic en "Guardar proyecto"
5. Haz clic en ▶ Ejecutar
6. Autoriza la aplicación cuando te lo pida
7. Espera a que termine (~5-10 min)
8. Ve a tu Google Drive → busca la carpeta "Sprite_ZIPs"
9. Descarga los ZIPs y súbelos a GitHub Releases (tag `sprites-v1`)

## ZIPs generados

- Gen1.zip (~3K files)
- Gen2.zip (~5K files)
- Gen3.zip (~8K files)
- Gen4.zip (~16K files)
- Gen5.zip (~15K files)
- Gen6.zip (~5K files)
- Gen7.zip (~5K files)
- Gen8.zip (~5K files)
- Gen9.zip (~17K files, puede partirse en partes)
- LEGENDS_ARCEUS.zip (~700 files)
