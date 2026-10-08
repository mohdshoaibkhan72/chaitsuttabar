# Real 3D food models (optional)

The 3D dishes are built in code. To use a real scanned / photogrammetry model for a dish instead,
drop a binary glTF here named after the menu category:

`chai.glb  pizza.glb  burgers.glb  pasta.glb  sandwich.glb  maggi.glb  coffee.glb  drinks.glb  snacks.glb  sweets.glb`

It is detected automatically, auto-centered, sat on the platform and scaled to fit. Compress with
`gltf-transform optimize` (Draco/meshopt + WebP textures) to keep files under ~3 MB.
