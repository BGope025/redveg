import re, shutil, subprocess, tarfile, urllib.request
from pathlib import Path

archive = Path('/home/redvegadmin/redveg-phone-required.tar.gz')
stage = Path('/home/redvegadmin/.phone-required-stage-20261023')
webroot = Path('/var/www/redveg.in')
backup = Path('/home/redvegadmin/.backups/phone-required-20261023')
if not archive.is_file():
    raise SystemExit('Release archive is missing')
stage.mkdir(parents=True, exist_ok=False)
with tarfile.open(archive, 'r:gz') as bundle:
    for member in bundle.getmembers():
        target = (stage / member.name).resolve()
        if stage.resolve() not in target.parents and target != stage.resolve():
            raise SystemExit('Unsafe release archive path')
    bundle.extractall(stage, filter='data')
html = (stage / 'index.html').read_text()
assets = stage / 'assets'
js = list(assets.glob('*.js'))
prompt_files = [p for p in js if b'Add a phone number to your profile' in p.read_bytes()]
if len(prompt_files) != 1 or b'Add later' in prompt_files[0].read_bytes():
    raise SystemExit('Required, non-dismissible prompt not found in release bundle')
references = re.findall(r'/assets/([^\" ]+)', html)
if not references or any(not (assets / name).is_file() for name in references):
    raise SystemExit('Release HTML references missing assets')
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(webroot / 'index.html', backup / 'index.html')
# Copy the *contents* of assets; keep the leading /./ to avoid creating assets/assets.
subprocess.run(['sudo', '-n', 'cp', '-a', str(assets) + '/.', str(webroot / 'assets') + '/'], check=True)
if any(not (webroot / 'assets' / name).is_file() for name in references):
    raise SystemExit('Asset install verification failed; previous index remains active')
subprocess.run(['sudo', '-n', 'install', '-m', '644', str(stage / 'index.html'), str(webroot / 'index.html.phone-required-new')], check=True)
subprocess.run(['sudo', '-n', 'mv', '-f', str(webroot / 'index.html.phone-required-new'), str(webroot / 'index.html')], check=True)
req = urllib.request.Request('http://127.0.0.1/profile', headers={'Host': 'redveg.in'})
with urllib.request.urlopen(req, timeout=10) as response:
    live_html = response.read().decode('utf-8', 'replace')
    if response.status != 200 or not all('/assets/' + name in live_html for name in references):
        raise SystemExit('Live profile entry did not return the new assets')
print('Live storefront profile: HTTP 200')
print('Required phone prompt chunk:', prompt_files[0].name)
print('Add later action: absent')
print('Rollback index:', backup / 'index.html')