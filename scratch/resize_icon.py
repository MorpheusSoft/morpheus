from PIL import Image
import os

base_path = "/home/lzambrano/Desarrollo/Morpheus/neo-erp-web/apps/neo-pricing/public"
img = Image.open(os.path.join(base_path, "icon.png"))

# Save 192x192 version
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(base_path, "icon-192.png"))

# Save 512x512 version
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(base_path, "icon-512.png"))

print("[+] Icons resized successfully!")
