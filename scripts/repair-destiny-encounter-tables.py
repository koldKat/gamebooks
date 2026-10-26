#!/usr/bin/env python3
"""Replace verified encounter pictures with text. Dry run unless --apply is set."""
import argparse
import html
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def encounter_table(parts):
    columns = [key for key in ['Speed', 'Brawn', 'Magic', 'Armour', 'Health']
               if key in ['Speed', 'Armour', 'Health'] or
               any(part['sourceValues'].get(key, '-') not in ['-', '—', '–', ''] for part in parts)]
    value = '<table class="reading-encounter-table"><thead><tr><th scope="col">Opponent</th>'
    value += ''.join('<th scope="col">' + key + '</th>' for key in columns)
    value += '</tr></thead><tbody>'
    for part in parts:
        value += '<tr><th scope="row">' + html.escape(part['name']) + '</th>'
        value += ''.join('<td>' + html.escape(str(part['sourceValues'].get(key, '-'))) + '</td>' for key in columns)
        value += '</tr>'
    return value + '</tbody></table>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / 'database.sqlite')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    connection = sqlite3.connect(args.database if args.apply else 'file:' + str(args.database) + '?mode=ro',
                                 uri=not args.apply, timeout=10)
    recipe = json.loads((ROOT / 'data/reading-repairs/destiny-encounter-tables.json').read_text())
    changes, already = [], 0
    for book in recipe['books']:
        book_id = book['bookId']
        roster = json.loads((ROOT / f'data/simulator-rosters/{book_id}.json').read_text())
        groups = {}
        for enemy in roster['enemies']:
            groups.setdefault(enemy['stats']['encounter']['section'], []).append(enemy['stats']['part'])
        for section, image in book['encounterImages'].items():
            row = connection.execute('SELECT html FROM book_sections WHERE book_id=? AND section_id=?',
                                     (book_id, section)).fetchone()
            if row is None:
                raise RuntimeError(f'Missing passage {book_id}/{section}')
            before, table = row[0], encounter_table(groups[section])
            image_url = f'/api/books/{book_id}/reading-images/{image}.png'
            if image_url not in before:
                if before.count(table) != 1:
                    raise RuntimeError(f'Unexpected encounter content {book_id}/{section}')
                already += 1
                continue
            matches = [figure for figure in re.findall(r'<figure\b[^>]*>.*?</figure>', before, re.S)
                       if image_url in figure]
            if len(matches) != 1 or table in before:
                raise RuntimeError(f'Ambiguous encounter image {book_id}/{section}')
            changes.append((before.replace(matches[0], table), book_id, section, before))
    if args.apply and changes:
        def authorize(action, table, column, database, origin):
            if action == sqlite3.SQLITE_UPDATE:
                return sqlite3.SQLITE_OK if table == 'book_sections' and column == 'html' and origin is None else sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK if action in [sqlite3.SQLITE_READ, sqlite3.SQLITE_SELECT,
                sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_TRANSACTION] else sqlite3.SQLITE_DENY
        connection.set_authorizer(authorize)
        try:
            connection.execute('BEGIN IMMEDIATE')
            for change in changes:
                result = connection.execute('UPDATE book_sections SET html=? WHERE book_id=? AND section_id=? AND html=?', change)
                if result.rowcount != 1:
                    raise RuntimeError('Passage changed while preparing the repair')
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.set_authorizer(None)
    connection.close()
    print(json.dumps({'applied': len(changes) if args.apply else 0,
                      'pending': 0 if args.apply else len(changes), 'alreadyText': already}))


if __name__ == '__main__':
    main()
