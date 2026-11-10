import zipfile, os
zip_filename = 'LUONGO-Tombola90-GoldEdition.zip'
with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('standalone-package/index.html', 'LUONGO-Tombola90-GoldEdition.html')
    z.write('standalone-package/tombola-luxury.css', 'tombola-luxury.css')
    z.write('standalone-package/tombola-controller.js', 'tombola-controller.js')
    if os.path.exists('standalone-package/pedina-bg.svg'):
        z.write('standalone-package/pedina-bg.svg', 'pedina-bg.svg')
    z.write('standalone-package/README.md', 'README.md')
os.system('cp ' + zip_filename + ' public/' + zip_filename)
