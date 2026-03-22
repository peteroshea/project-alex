"""
generate_cards.py
Downloads Pokemon TCG card data and saves as cards-data.js
Run once: python3 generate_cards.py
"""

import requests
import json
import time
import sys
import math

API = 'https://api.pokemontcg.io/v2/cards'
FIELDS = 'id,name,images,rarity,set,hp,types'
PAGE_SIZE = 250
TIMEOUT = 30

all_cards = []
total_pages = None
page = 1

while True:
    label = f'{page}/{total_pages}' if total_pages else page
    print(f'Fetching page {label}...', end=' ', flush=True)
    for attempt in range(3):
        try:
            url = f'{API}?pageSize={PAGE_SIZE}&page={page}&select={FIELDS}'
            r = requests.get(url, timeout=TIMEOUT)
            r.raise_for_status()
            payload = r.json()

            # On first page, compute total pages from totalCount
            if total_pages is None:
                total_count = payload.get('totalCount', 0)
                total_pages = math.ceil(total_count / PAGE_SIZE)
                print(f'({total_count} total cards, {total_pages} pages)', end=' ', flush=True)

            cards = payload.get('data', [])
            valid = [
                {
                    'id': c['id'],
                    'name': c.get('name', ''),
                    'images': c.get('images', {}),
                    'rarity': c.get('rarity', ''),
                    'setName': c.get('set', {}).get('name', ''),
                    'hp': c.get('hp', ''),
                    'types': c.get('types', []),
                }
                for c in cards
                if c.get('images', {}).get('large')
            ]
            all_cards.extend(valid)
            print(f'{len(valid)} cards (total: {len(all_cards)})')
            break
        except Exception as e:
            print(f'attempt {attempt+1} failed: {e}', end=' ', flush=True)
            if attempt < 2:
                time.sleep(3)
    else:
        print(f'Skipping page {page} after 3 failed attempts')

    if total_pages and page >= total_pages:
        break
    page += 1
    time.sleep(0.3)

if not all_cards:
    print('ERROR: No cards fetched. Check your internet connection.')
    sys.exit(1)

out = f'window.CARDS_DATA = {json.dumps(all_cards, separators=(",", ":"))};'

with open('cards-data.js', 'w', encoding='utf-8') as f:
    f.write(out)

size_kb = len(out.encode()) / 1024
print(f'\nDone! {len(all_cards)} cards saved to cards-data.js ({size_kb:.0f} KB)')
