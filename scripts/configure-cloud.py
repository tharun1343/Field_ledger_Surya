"""Bakes your Supabase project into index.html so people only see email + password.

    python3 scripts/configure-cloud.py https://xxxx.supabase.co <anon-public-key>

The anon key is designed to be public (row-level security protects the data). Never put the
service_role key here. Run android/build-apk.sh and scripts/build-web.py afterwards.
"""
import os, re, sys
if len(sys.argv) != 3 or not re.match(r'^https://[^/\s]+$', sys.argv[1].rstrip('/')):
    sys.exit(__doc__)
url, key = sys.argv[1].rstrip('/'), sys.argv[2].strip()
if 'service_role' in key or len(key) < 20:
    sys.exit('That does not look like the anon public key.')
p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html')
s = open(p, encoding='utf8').read()
s, n = re.subn(r"const CLOUD_DEFAULTS = \{ url: '[^']*', anonKey: '[^']*' \};", f"const CLOUD_DEFAULTS = {{ url: '{url}', anonKey: '{key}' }};", s)
if n != 1:
    sys.exit('CLOUD_DEFAULTS line not found in index.html')
open(p, 'w', encoding='utf8').write(s)
print('index.html now uses', url)
