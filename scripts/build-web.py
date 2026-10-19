"""Builds dist/web/fieldledger.html: index.html reshaped for publishing as a claude.ai page.

The claude.ai publisher wraps the file in its own <!doctype><html><head><body> skeleton, so this keeps
the <title>, <style>, markup and <script> and drops the outer document tags. The app itself is unchanged.
"""
import os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'index.html'), encoding='utf8').read()
title = re.search(r'<title>.*?</title>', src, re.S).group(0)
style = re.search(r'<style>.*?</style>', src, re.S).group(0)
body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)
out = '\n'.join([title.replace('FieldLedger — Farm Business Tracker', 'FieldLedger Farm Ledger'),
                 '<meta name="theme-color" content="#6d45d9">', style, body.strip(), ''])
dest = os.path.join(root, 'dist', 'web'); os.makedirs(dest, exist_ok=True)
open(os.path.join(dest, 'fieldledger.html'), 'w', encoding='utf8').write(out)
print('wrote dist/web/fieldledger.html', len(out), 'bytes')
