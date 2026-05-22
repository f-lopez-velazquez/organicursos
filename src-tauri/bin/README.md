Coloca aqui los sidecars de `ffmpeg` y `ffprobe` con el nombre esperado por Tauri segun la plataforma:

- Windows x64:
  - `ffmpeg-x86_64-pc-windows-msvc.exe`
  - `ffprobe-x86_64-pc-windows-msvc.exe`
- macOS Intel:
  - `ffmpeg-x86_64-apple-darwin`
  - `ffprobe-x86_64-apple-darwin`
- macOS Apple Silicon:
  - `ffmpeg-aarch64-apple-darwin`
  - `ffprobe-aarch64-apple-darwin`
- Linux x64:
  - `ffmpeg-x86_64-unknown-linux-gnu`
  - `ffprobe-x86_64-unknown-linux-gnu`
- Linux ARM64:
  - `ffmpeg-aarch64-unknown-linux-gnu`
  - `ffprobe-aarch64-unknown-linux-gnu`

Scripts de apoyo:

- Windows: `npm run stage:sidecars:windows`
- macOS: `npm run stage:sidecars:macos -- --arch arm64|x64`
- Linux: `npm run stage:sidecars:linux -- --arch x64|arm64`
