#!/usr/bin/env python3
"""
Playwright-based batch downloader for Google Drive files from Luminist.org
Uses browser automation to download files that are blocked from direct HTTP access.
"""

import json
import os
import shutil
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE_DIR = '/mnt/agents/output/sacred_texts_archive/source5_luminist/'
TEMP_DL_DIR = '/tmp/gdrive_downloads'

# Load download plan
with open(os.path.join(BASE_DIR, '_download_plan.json')) as f:
    all_downloads = json.load(f)

# Filter only Google Drive files
gdrive_files = [d for d in all_downloads if d['source'] == 'google_drive']

# Track results
results = {
    'success': [],
    'failed': [],
    'skipped': []
}

async def download_gdrive_file(page, file_info, temp_dir):
    """Download a single Google Drive file using Playwright"""
    file_id = file_info['file_id']
    local_path = file_info['local_path']
    title = file_info['title']
    index = file_info['index']
    
    # Skip if already exists and is large enough
    if os.path.exists(local_path) and os.path.getsize(local_path) > 1000:
        size_mb = os.path.getsize(local_path) / (1024*1024)
        results['skipped'].append({
            'index': index, 'title': title, 'path': local_path,
            'size_mb': round(size_mb, 2)
        })
        return True
    
    url = f"https://drive.google.com/file/d/{file_id}/view"
    
    try:
        # Set up download handler
        download_future = asyncio.Future()
        
        async def handle_download(download):
            try:
                save_path = os.path.join(temp_dir, f"dl_{file_id}")
                await download.save_as(save_path)
                download_future.set_result(save_path)
            except Exception as e:
                download_future.set_exception(e)
        
        page.on("download", lambda dl: asyncio.create_task(handle_download(dl)))
        
        # Navigate to file
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(1)
        
        # Try to click the download button (File menu -> Download)
        # First click "File" / "文件" button
        file_btn = await page.query_selector('button[aria-label="File"]') or \
                   await page.query_selector('button:has-text("文件")') or \
                   await page.query_selector('div[role="button"][aria-label="File"]')
        
        if file_btn:
            await file_btn.click()
            await asyncio.sleep(0.5)
            
            # Click "Download" / "下载"
            dl_btn = await page.query_selector('[aria-label="Download"]') or \
                     await page.query_selector('text=下载') or \
                     await page.query_selector('text=Download')
            
            if dl_btn:
                await dl_btn.click()
                
                # Wait for download with timeout
                try:
                    save_path = await asyncio.wait_for(download_future, timeout=30)
                    
                    # Move to final location
                    if os.path.exists(save_path) and os.path.getsize(save_path) > 1000:
                        os.makedirs(os.path.dirname(local_path), exist_ok=True)
                        shutil.move(save_path, local_path)
                        size_mb = os.path.getsize(local_path) / (1024*1024)
                        results['success'].append({
                            'index': index, 'title': title, 
                            'path': local_path, 'size_mb': round(size_mb, 2)
                        })
                        return True
                except asyncio.TimeoutError:
                    pass
        
        # Alternative: try direct download URL
        direct_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
        download_future = asyncio.Future()
        page.on("download", lambda dl: asyncio.create_task(handle_download(dl)))
        
        await page.goto(direct_url, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Check if download was triggered
        save_path = os.path.join(temp_dir, f"dl_{file_id}")
        if os.path.exists(save_path) and os.path.getsize(save_path) > 1000:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            shutil.move(save_path, local_path)
            size_mb = os.path.getsize(local_path) / (1024*1024)
            results['success'].append({
                'index': index, 'title': title, 
                'path': local_path, 'size_mb': round(size_mb, 2)
            })
            return True
            
        results['failed'].append({
            'index': index, 'title': title, 'file_id': file_id,
            'error': 'Download not triggered'
        })
        return False
        
    except Exception as e:
        results['failed'].append({
            'index': index, 'title': title, 'file_id': file_id,
            'error': str(e)
        })
        return False

async def main():
    os.makedirs(TEMP_DL_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, downloads_path=TEMP_DL_DIR)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        # Process files in batches
        total = len(gdrive_files)
        batch_size = 10
        
        for batch_start in range(0, total, batch_size):
            batch_end = min(batch_start + batch_size, total)
            batch = gdrive_files[batch_start:batch_end]
            
            print(f"\nProcessing batch {batch_start//batch_size + 1}: files {batch_start+1}-{batch_end}/{total}")
            
            for i, file_info in enumerate(batch):
                global_idx = batch_start + i + 1
                print(f"  [{global_idx}/{total}] {file_info['filename'][:60]}...", end=" ", flush=True)
                
                success = await download_gdrive_file(page, file_info, TEMP_DL_DIR)
                status = "OK" if success else "FAIL"
                print(f"[{status}]")
                
                # Clean up temp files
                for f in os.listdir(TEMP_DL_DIR):
                    os.remove(os.path.join(TEMP_DL_DIR, f))
            
            # Small pause between batches
            await asyncio.sleep(2)
        
        await browser.close()
    
    # Save results
    with open(os.path.join(BASE_DIR, '_playwright_results.json'), 'w') as f:
        json.dump(results, f, indent=2)
    
    # Print summary
    success_count = len(results['success'])
    skip_count = len(results['skipped'])
    fail_count = len(results['failed'])
    total_size = sum(d.get('size_mb', 0) for d in results['success'])
    
    print(f"\n{'='*50}")
    print(f"DOWNLOAD COMPLETE")
    print(f"{'='*50}")
    print(f"  Success: {success_count}")
    print(f"  Skipped: {skip_count}")
    print(f"  Failed: {fail_count}")
    print(f"  Total size: {total_size:.2f} MB")

if __name__ == '__main__':
    asyncio.run(main())
