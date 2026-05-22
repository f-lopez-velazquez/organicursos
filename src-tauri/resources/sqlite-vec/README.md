Coloca aqui las bibliotecas nativas de `sqlite-vec` por plataforma:

- Windows: `vec0.dll` o `sqlite_vec.dll`
- macOS: `vec0.dylib` o `sqlite_vec.dylib`
- Linux: `vec0.so` o `sqlite_vec.so`

Scripts de apoyo:

- Windows: `npm run stage:sqlite-vec:windows`
- macOS: `npm run stage:sqlite-vec:macos -- --source /ruta/vec0.dylib`
- Linux: `npm run stage:sqlite-vec:linux -- --source /ruta/vec0.so`

La carga es opcional en runtime. Si la libreria no existe, la app sigue funcionando con busqueda FTS5 y deja la busqueda semantica desactivada.
