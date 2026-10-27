import os, shutil, subprocess, sys, tarfile, time, urllib.request
from pathlib import Path

archive = Path('/home/redvegadmin/phone-flow-release.tar.gz')
stage = Path('/home/redvegadmin/.phone-flow-stage')
backend = Path('/home/redvegadmin/redveg-backend/server/api/v1/customers')
controller = backend / 'customer-account.controller.js'
routes = backend / 'customers.routes.js'
webroot = Path('/var/www/redveg.in')
backup = Path('/home/redvegadmin/.backups/phone-flow-20261023')

if not archive.is_file():
    raise SystemExit('Release archive is missing')
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)
with tarfile.open(archive, 'r:gz') as bundle:
    for member in bundle.getmembers():
        target = (stage / member.name).resolve()
        if stage.resolve() not in target.parents and target != stage.resolve():
            raise SystemExit('Unsafe release archive path')
    bundle.extractall(stage, filter='data')

controller_text = controller.read_text()
routes_text = routes.read_text()
method = (stage / 'backend/phone-method.js').read_text().strip()
if 'async function updateMyPhoneNumber(req, res)' not in controller_text:
    marker = 'async function getMyOrders(req, res) {'
    export_marker = 'module.exports = { syncFirebaseCustomer, getMyProfile,'
    if controller_text.count(marker) != 1 or controller_text.count(export_marker) != 1:
        raise SystemExit('Live controller did not match expected patch points; no files changed')
    controller_text = controller_text.replace(marker, method + '\n\n' + marker, 1)
    controller_text = controller_text.replace(export_marker, 'module.exports = { syncFirebaseCustomer, updateMyPhoneNumber, getMyProfile,', 1)
if "router.put('/me/phone', authenticateFirebaseCustomer, updateMyPhoneNumber);" not in routes_text:
    import_marker = 'const { syncFirebaseCustomer, getMyProfile,'
    route_marker = "router.post('/me/sync', authenticateFirebaseCustomer, syncFirebaseCustomer);"
    if routes_text.count(import_marker) != 1 or routes_text.count(route_marker) != 1:
        raise SystemExit('Live customer router did not match expected patch points; no files changed')
    routes_text = routes_text.replace(import_marker, 'const { syncFirebaseCustomer, updateMyPhoneNumber, getMyProfile,', 1)
    routes_text = routes_text.replace(route_marker, route_marker + "\nrouter.put('/me/phone', authenticateFirebaseCustomer, updateMyPhoneNumber);", 1)

backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(controller, backup / 'customer-account.controller.js')
shutil.copy2(routes, backup / 'customers.routes.js')
shutil.copy2(webroot / 'index.html', backup / 'index.html')
new_controller = stage / 'customer-account.controller.js'
new_routes = stage / 'customers.routes.js'
new_controller.write_text(controller_text)
new_routes.write_text(routes_text)
subprocess.run(['node', '--check', str(new_controller)], check=True)
subprocess.run(['node', '--check', str(new_routes)], check=True)
shutil.copy2(new_controller, controller)
shutil.copy2(new_routes, routes)
try:
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'redveg-backend.service'], check=True)
    healthy = False
    for _ in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/api/v1/health/ping', timeout=3) as response:
                healthy = response.status == 200
            if healthy:
                break
        except Exception:
            pass
        time.sleep(1)
    if not healthy:
        raise RuntimeError('Backend health check did not return HTTP 200')
except Exception:
    shutil.copy2(backup / 'customer-account.controller.js', controller)
    shutil.copy2(backup / 'customers.routes.js', routes)
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'redveg-backend.service'], check=False)
    raise

subprocess.run(['sudo', '-n', 'cp', '-a', str(stage / 'assets/.') , str(webroot / 'assets/')], check=True)
subprocess.run(['sudo', '-n', 'install', '-m', '644', str(stage / 'index.html'), str(webroot / 'index.html.phone-flow-new')], check=True)
subprocess.run(['sudo', '-n', 'mv', '-f', str(webroot / 'index.html.phone-flow-new'), str(webroot / 'index.html')], check=True)
print('Backend syntax: OK')
print('Backend service health: HTTP 200')
print('Storefront index and hashed assets: installed')
print('Rollback files:', backup)