import os
import shutil
import zipfile

zip_filename = 'public/tombola-90-complete.zip'
exclude_dirs = {'node_modules', 'dist', '.git', '.playwright-cli', '.aistudio'}
exclude_extensions = {'.png', '.zip'}

with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk('.'):
        # Modifica dirs in-place per escludere cartelle indesiderate
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in exclude_extensions and not root.startswith('./public/assets'):
                continue
            filepath = os.path.join(root, file)
            # Salva con percorso relativo pulito
            arcname = os.path.relpath(filepath, '.')
            if arcname.startswith('public/tombola-90-complete.zip') or arcname.startswith('public/luongo-tombola-90-complete.zip'):
                continue
            zipf.write(filepath, arcname)

# Copia di compatibilità per eventuali link precedenti
shutil.copyfile(zip_filename, 'public/luongo-tombola-90-complete.zip')
print(f"Created {zip_filename} and public/luongo-tombola-90-complete.zip successfully!")
