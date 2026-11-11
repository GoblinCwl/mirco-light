"""Generate the local QQ QR asset after changing qqLink in config.ts.

Requires Python qrcode==8.2; no QR service or build-time dependency is used.
"""
from pathlib import Path
import re
import qrcode
import qrcode.image.svg

home = Path(__file__).resolve().parent
config = (home / "config.ts").read_text()
link = re.search(r'qqLink:\s*"([^"]+)"', config).group(1)
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=10)
qr.add_data(link)
qr.make(fit=True)
image = qr.make_image(image_factory=qrcode.image.svg.SvgPathFillImage)
image.save(home.parent / "static" / "qq-add.svg")
print("Generated project-local QQ QR code.")
