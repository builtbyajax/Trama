# Trama artwork

`trama-aberta-master.svg` is the original mark. The interface and README covers
use this drawing. The transparent and 16, 24, 32, and 64 px variants are included
with the original artwork.

`trama-aberta-macos.svg` centers the same mark on a transparent 1024 px canvas,
with 100 px of padding on each side for the Dock.

To regenerate desktop exports, run from `app/`:

```sh
npm run tauri -- icon src/assets/brand/trama-aberta-master.svg --output /tmp/trama-icons
npm run tauri -- icon src/assets/brand/trama-aberta-macos.svg --output /tmp/trama-icons-macos
```

Copy `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, and `icon.ico`
from the first output into `src-tauri/icons/`. Copy `icon.icns` from the macOS
output. These are the desktop formats used by this project.
