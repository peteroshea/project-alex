"""
generate_cards.py
Downloads Pokemon TCG card data and saves as cards-data.js
Run once: python3 generate_cards.py
"""

import requests
import json
import time
import sys

API = 'https://api.pokemontcg.io/v2/cards'
FIELDS = 'id,name,images,rarity,set,hp,types'
PAGE_SIZE = 250
PAGES = 6  # 6 x 250 = up to 1500 cards
TIMEOUT = 30

all_cards = []

for page in range(1, PAGES + 1):
    print(f'Fetching page {page}/{PAGES}...', end=' ', flush=True)
    for attempt in range(3):
        try:
            # Build URL manually to avoid commas being URL-encoded in select param
            url = f'{API}?pageSize={PAGE_SIZE}&page={page}&select={FIELDS}'
            r = requests.get(url, timeout=TIMEOUT)
            r.raise_for_status()
            cards = r.json().get('data', [])
            # Only keep cards with a large image
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

    time.sleep(0.3)

if not all_cards:
    print('ERROR: No cards fetched. Check your internet connection.')
    sys.exit(1)

out = f'window.CARDS_DATA = {json.dumps(all_cards, separators=(",", ":"))};'

with open('cards-data.js', 'w', encoding='utf-8') as f:
    f.write(out)

size_kb = len(out.encode()) / 1024
print(f'\nDone! {len(all_cards)} cards saved to cards-data.js ({size_kb:.0f} KB)')
