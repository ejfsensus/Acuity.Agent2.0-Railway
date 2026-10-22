#!/usr/bin/env python3
"""
Batch download script for Luminist.org sacred texts
Handles Google Drive (via gdown), direct HTTP downloads, and tracks results
"""

import json
import os
import sys
import subprocess
import requests
import time
from pathlib import Path
import urllib.parse

BASE_DIR = '/mnt/agents/output/sacred_texts_archive/source5_luminist/'
GDOWN_PATH = os.path.expanduser('~/.local/bin/gdown')

# Load download plan
with open(os.path.join(BASE_DIR, '_download_plan.json')) as f:
    downloads = json.load(f)

results = {
    'success': [],
    'failed': [],
    'skipped': []
}

def download_gdrive(file_id, local_path, title, index_num):
    """Download from Google Drive using gdown"""
    if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
        size_mb = os.path.getsize(local_path) / (1024*1024)
        results['skipped'].append({
            'index': index_num, 'title': title, 'path': local_path,
            'reason': 'already_exists', 'size_mb': round(size_mb, 2)
        })
        return True
    
    try:
        # Use gdown with --no-cookies and -q (quiet)
        cmd = [sys.executable, '-m', 'gdown', file_id, '-O', local_path, '--no-cookies', '-q']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0 and os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
            size_mb = os.path.getsize(local_path) / (1024*1024)
            results['success'].append({
                'index': index_num, 'title': title, 'path': local_path,
                'source': 'google_drive', 'size_mb': round(size_mb, 2)
            })
            return True
        else:
            # gdown failed - try wget fallback
            return download_with_wget(file_id, local_path, title, index_num)
    except Exception as e:
        return download_with_wget(file_id, local_path, title, index_num)

def download_with_wget(file_id, local_path, title, index_num):
    """Fallback: Download Google Drive file using wget"""
    try:
        url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
        cmd = ['wget', '-q', '--timeout=60', '--tries=2', '-O', local_path, url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0 and os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
            size_mb = os.path.getsize(local_path) / (1024*1024)
            results['success'].append({
                'index': index_num, 'title': title, 'path': local_path,
                'source': 'google_drive_wget', 'size_mb': round(size_mb, 2)
            })
            return True
        else:
            results['failed'].append({
                'index': index_num, 'title': title, 'file_id': file_id,
                'error': f'gdown and wget both failed'
            })
            return False
    except Exception as e:
        results['failed'].append({
            'index': index_num, 'title': title, 'file_id': file_id,
            'error': str(e)
        })
        return False

def download_direct(url, local_path, title, index_num, source_type):
    """Download from direct URL using requests"""
    if os.path.exists(local_path) and os.path.getsize(local_path) > 100:
        size_mb = os.path.getsize(local_path) / (1024*1024)
        results['skipped'].append({
            'index': index_num, 'title': title, 'path': local_path,
            'reason': 'already_exists', 'size_mb': round(size_mb, 2)
        })
        return True
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        resp = requests.get(url, headers=headers, timeout=60, allow_redirects=True)
        
        if resp.status_code == 200 and len(resp.content) > 100:
            with open(local_path, 'wb') as f:
                f.write(resp.content)
            size_mb = len(resp.content) / (1024*1024)
            results['success'].append({
                'index': index_num, 'title': title, 'path': local_path,
                'source': source_type, 'size_mb': round(size_mb, 2)
            })
            return True
        else:
            results['failed'].append({
                'index': index_num, 'title': title, 'url': url,
                'error': f'HTTP {resp.status_code}, size={len(resp.content)}'
            })
            return False
    except Exception as e:
        results['failed'].append({
            'index': index_num, 'title': title, 'url': url,
            'error': str(e)
        })
        return False

def download_curl(url, local_path, title, index_num, source_type):
    """Download using curl as fallback"""
    try:
        cmd = ['curl', '-sL', '--max-time', '60', '-o', local_path, url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0 and os.path.exists(local_path) and os.path.getsize(local_path) > 100:
            size_mb = os.path.getsize(local_path) / (1024*1024)
            results['success'].append({
                'index': index_num, 'title': title, 'path': local_path,
                'source': f'{source_type}_curl', 'size_mb': round(size_mb, 2)
            })
            return True
        else:
            results['failed'].append({
                'index': index_num, 'title': title, 'url': url,
                'error': f'curl failed with returncode {result.returncode}'
            })
            return False
    except Exception as e:
        results['failed'].append({
            'index': index_num, 'title': title, 'url': url,
            'error': str(e)
        })
        return False

# Process all downloads
gdrive_downloads = [d for d in downloads if d['source'] == 'google_drive']
direct_downloads = [d for d in downloads if d['source'] in ['wasabi_s3', 'local']]
adobe_downloads = [d for d in downloads if d['source'] == 'adobe_dc']
box_downloads = [d for d in downloads if d['source'] == 'box']

print(f"Starting downloads:")
print(f"  Google Drive: {len(gdrive_downloads)}")
print(f"  Direct (wasabi_s3 + local): {len(direct_downloads)}")
print(f"  Adobe DC: {len(adobe_downloads)}")
print(f"  Box: {len(box_downloads)}")
print()

# 1. Process Google Drive downloads (batch of 131)
print("=" * 60)
print("PHASE 1: Google Drive downloads via gdown")
print("=" * 60)

for i, d in enumerate(gdrive_downloads):
    print(f"[{i+1}/{len(gdrive_downloads)}] Downloading: {d['filename'][:70]}...", end=' ', flush=True)
    success = download_gdrive(d['file_id'], d['local_path'], d['title'], d['index'])
    status = "OK" if success else "FAIL"
    print(f"[{status}]")
    
    # Small delay to be polite
    if (i + 1) % 10 == 0:
        time.sleep(2)

# 2. Process direct downloads
print("\n" + "=" * 60)
print("PHASE 2: Direct HTTP downloads")
print("=" * 60)

for d in direct_downloads:
    print(f"Downloading: {d['filename'][:70]}...", end=' ', flush=True)
    success = download_direct(d['url'], d['local_path'], d['title'], d['index'], d['source'])
    if not success:
        success = download_curl(d['url'], d['local_path'], d['title'], d['index'], d['source'])
    status = "OK" if success else "FAIL"
    print(f"[{status}]")

# 3. Try Adobe DC downloads
print("\n" + "=" * 60)
print("PHASE 3: Adobe DC downloads (likely blocked)")
print("=" * 60)

for d in adobe_downloads:
    print(f"Attempting: {d['filename'][:70]}...", end=' ', flush=True)
    # Adobe DC links redirect - try curl with -L
    success = download_curl(d['url'], d['local_path'], d['title'], d['index'], d['source'])
    status = "OK" if success else "FAIL (expected - Adobe DC blocks)"
    print(f"[{status}]")

# 4. Try Box downloads
print("\n" + "=" * 60)
print("PHASE 4: Box downloads (likely blocked)")
print("=" * 60)

for d in box_downloads:
    print(f"Attempting: {d['filename'][:70]}...", end=' ', flush=True)
    # Box links require authentication - will likely fail
    success = download_curl(d['url'], d['local_path'], d['title'], d['index'], d['source'])
    status = "OK" if success else "FAIL (expected - Box requires auth)"
    print(f"[{status}]")

# Save results
print("\n" + "=" * 60)
print("DOWNLOAD COMPLETE - Saving results")
print("=" * 60)

with open(os.path.join(BASE_DIR, '_batch_results.json'), 'w') as f:
    json.dump(results, f, indent=2)

total_success = len(results['success'])
total_failed = len(results['failed'])
total_skipped = len(results['skipped'])
total_size = sum(d.get('size_mb', 0) for d in results['success'] + results['skipped'])

print(f"\nSUMMARY:")
print(f"  Success: {total_success}")
print(f"  Skipped (already exist): {total_skipped}")
print(f"  Failed: {total_failed}")
print(f"  Total size: {total_size:.2f} MB")
